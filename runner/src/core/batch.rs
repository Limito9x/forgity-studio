use std::sync::Arc;
use tokio::sync::Semaphore;
use serde_json::Value;
use std::collections::HashMap;
use tracing::{debug, info, warn, error};
use std::future::Future;

/// Cấu hình cho việc chạy một Component Pipe ở chế độ Batch
#[derive(Debug, Clone)]
pub struct BatchExecutionConfig {
    /// Giới hạn số tiến trình DCC / Worker chạy song song cùng lúc (mặc định 2 hoặc 3 để bảo toàn VRAM)
    pub max_concurrency: usize,
    /// Tên chân pin đầu vào nhận mảng lặp (iterable pin, ví dụ: "cloth_files" hoặc "duf_paths")
    pub iterable_pin_name: String,
    /// Bỏ qua phần tử lỗi và tiếp tục các phần tử khác trong mảng (fault-tolerant skip)
    pub skip_on_error: bool,
}

impl Default for BatchExecutionConfig {
    fn default() -> Self {
        Self {
            max_concurrency: 2,
            iterable_pin_name: "items".to_string(),
            skip_on_error: true,
        }
    }
}

/// Kết quả tổng hợp sau khi chạy qua toàn bộ N phần tử của Batch
#[derive(Debug, Clone)]
pub struct BatchGatherResult {
    /// Tổng số phần tử đầu vào N
    pub total_items: usize,
    /// Số phần tử chạy thành công
    pub succeeded_count: usize,
    /// Số phần tử bị lỗi/bỏ qua (skip)
    pub skipped_count: usize,
    /// Danh sách kết quả outputs được gom lại (chân mảng tự động gom thành Vec<Value>)
    pub gathered_outputs: HashMap<String, Value>,
}

/// Điều phối chạy Batch với giới hạn Semaphore (top K concurrent) và Fault-Tolerant Skip
pub async fn execute_batch_concurrent<F, Fut>(
    config: BatchExecutionConfig,
    base_inputs: HashMap<String, Value>,
    item_executor: F,
) -> Result<BatchGatherResult, String>
where
    F: Fn(usize, Value, HashMap<String, Value>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<HashMap<String, Value>, String>> + Send + 'static,
{
    // 1. Trích xuất mảng phần tử đầu vào từ iterable_pin_name
    let items_array = match base_inputs.get(&config.iterable_pin_name) {
        Some(Value::Array(arr)) => arr.clone(),
        Some(single_val) => vec![single_val.clone()], // Nếu chỉ truyền 1 phần tử đơn lẻ, tự động bọc thành mảng 1 phần tử
        None => return Err(format!("Iterable pin '{}' not found in inputs", config.iterable_pin_name)),
    };

    let total_items = items_array.len();
    if total_items == 0 {
        return Ok(BatchGatherResult {
            total_items: 0,
            succeeded_count: 0,
            skipped_count: 0,
            gathered_outputs: HashMap::new(),
        });
    }

    info!(
        total = total_items,
        concurrency = config.max_concurrency,
        skip_on_error = config.skip_on_error,
        "Starting bounded parallel batch execution"
    );

    // 2. Khởi tạo Semaphore để rào lại tối đa max_concurrency tiến trình
    let semaphore = Arc::new(Semaphore::new(config.max_concurrency));
    let mut tasks = Vec::new();

    // 3. Chuẩn bị static broadcast inputs (loại bỏ chân iterable)
    let mut broadcast_inputs = base_inputs.clone();
    broadcast_inputs.remove(&config.iterable_pin_name);

    let executor = Arc::new(item_executor);

    // 4. Cắt lát và dispatch N tasks vào Tokio runtime
    for (index, item_val) in items_array.into_iter().enumerate() {
        let sem = semaphore.clone();
        let exec = executor.clone();
        let item_broadcast = broadcast_inputs.clone();
        let skip_on_err = config.skip_on_error;

        tasks.push(tokio::spawn(async move {
            // Xin cấp phát 1 slot từ Semaphore trước khi kích hoạt worker
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
            debug!(item_index = index, "Acquired semaphore slot. Executing item task...");

            let result = exec(index, item_val, item_broadcast).await;

            match result {
                Ok(outputs) => Ok(Some(outputs)),
                Err(err) => {
                    if skip_on_err {
                        warn!(item_index = index, error = %err, "Batch item failed. Skip-on-error active, continuing...");
                        Ok(None)
                    } else {
                        error!(item_index = index, error = %err, "Batch item failed. Aborting batch...");
                        Err(err)
                    }
                }
            }
        }));
    }

    // 5. Barrier Gather: Chờ TOÀN BỘ N tasks chạy xong hoàn toàn
    let mut succeeded_count = 0;
    let mut skipped_count = 0;
    let mut collected_item_outputs: Vec<HashMap<String, Value>> = Vec::new();

    for task in tasks {
        let res = task.await.map_err(|e| format!("Tokio task panicked: {}", e))??;
        match res {
            Some(outputs) => {
                succeeded_count += 1;
                collected_item_outputs.push(outputs);
            }
            None => {
                skipped_count += 1;
            }
        }
    }

    // 6. Gom mảng kết quả: gom các output chân tương ứng thành mảng Vec<Value>
    let mut gathered_outputs: HashMap<String, Value> = HashMap::new();
    let mut pin_buckets: HashMap<String, Vec<Value>> = HashMap::new();

    for item_map in collected_item_outputs {
        for (pin_id, pin_val) in item_map {
            let bucket = pin_buckets.entry(pin_id).or_insert_with(Vec::new);
            match pin_val {
                Value::Array(inner_arr) => bucket.extend(inner_arr),
                other => bucket.push(other),
            }
        }
    }

    for (pin_id, bucket_vec) in pin_buckets {
        gathered_outputs.insert(pin_id, Value::Array(bucket_vec));
    }

    info!(
        total = total_items,
        succeeded = succeeded_count,
        skipped = skipped_count,
        "Batch execution completed barrier synchronization"
    );

    Ok(BatchGatherResult {
        total_items,
        succeeded_count,
        skipped_count,
        gathered_outputs,
    })
}

