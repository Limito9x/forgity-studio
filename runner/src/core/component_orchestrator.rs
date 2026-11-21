use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use super::batch::{execute_batch_concurrent, BatchExecutionConfig};
use super::contracts::{StageTaskMessage, StepExecution, StepInputMapping};
use super::dag::{DagNodeDefinition, DagPipelineDocument, DagScheduler};
use super::dispatcher::StageDispatcher;
use super::pure_nodes::{execute_constant_node, execute_pure_node, PureNodeResult};
use super::traits::{EventSink, QuotaGate, ResourceResolver, RunnerExecutionEvent};

/// Tầng 1: Điều phối thực thi 1 Component Pipe (`*.component.yaml`) ở ngoài tiến trình DCC.
/// Hỗ trợ cả chế độ Single (1:1) và Batch (`Array<T>` với Semaphore giới hạn concurrency + flatten output).
#[derive(Clone)]
pub struct ComponentOrchestrator {
    dispatcher: Arc<StageDispatcher>,
    resolver: Arc<dyn ResourceResolver>,
    event_sink: Arc<dyn EventSink>,
    quota_gate: Arc<dyn QuotaGate>,
}

impl ComponentOrchestrator {
    pub fn new(
        dispatcher: Arc<StageDispatcher>,
        resolver: Arc<dyn ResourceResolver>,
        event_sink: Arc<dyn EventSink>,
        quota_gate: Arc<dyn QuotaGate>,
    ) -> Self {
        Self {
            dispatcher,
            resolver,
            event_sink,
            quota_gate,
        }
    }

    /// Chạy Component Pipe: tự động phân nhánh Single hoặc Batch theo `batch_config`.
    pub async fn execute(
        self: Arc<Self>,
        doc: Arc<DagPipelineDocument>,
        run_id: String,
        inputs: HashMap<String, Value>,
        batch_config: Option<BatchExecutionConfig>,
        cancel: CancellationToken,
    ) -> Result<HashMap<String, Value>> {
        self.execute_with_stream(doc, run_id, inputs, batch_config, None, cancel)
            .await
    }

    /// Chạy Component Pipe kèm kênh phát trực tiếp từng phần tử hoàn thành (`item_tx`) cho `Joint` ở tầng Master.
    pub async fn execute_with_stream(
        self: Arc<Self>,
        doc: Arc<DagPipelineDocument>,
        run_id: String,
        inputs: HashMap<String, Value>,
        batch_config: Option<BatchExecutionConfig>,
        item_tx: Option<tokio::sync::mpsc::UnboundedSender<HashMap<String, Value>>>,
        cancel: CancellationToken,
    ) -> Result<HashMap<String, Value>> {
        if let Some(cfg) = batch_config {
            let items_vec = match inputs.get(&cfg.iterable_pin_name) {
                Some(Value::Array(arr)) => arr.clone(),
                Some(Value::Null) | None => Vec::new(),
                Some(single) => vec![single.clone()],
            };

            if items_vec.is_empty() {
                return Ok(HashMap::new());
            }

            let is_unreal_executor = doc
                .executor
                .as_deref()
                .map(|e| e.eq_ignore_ascii_case("unreal"))
                .unwrap_or(false);
            let start_pin_is_array = doc
                .nodes
                .iter()
                .find(|n| {
                    let t = n.tool.to_lowercase();
                    t == "start" || t == "local:start" || n.id == "start"
                })
                .and_then(|start_node| start_node.inputs.get(&cfg.iterable_pin_name))
                .map(|v| v.is_array())
                .unwrap_or(false);

            // Nếu Component là Unreal hoặc chân Start gốc đã nhận Array (như `fbx_files: Text[]`),
            // tuyệt đối KHÔNG xé lẻ thành phần tử đơn và KHÔNG spawn nhiều tiến trình song song,
            // mà cắt theo từng cụm `max_concurrency` và chạy tuần tự 1 tiến trình/đợt.
            if is_unreal_executor || start_pin_is_array {
                let chunk_size = cfg.max_concurrency.max(1);
                let chunks: Vec<Vec<Value>> = items_vec
                    .chunks(chunk_size)
                    .map(|c| c.to_vec())
                    .collect();
                let total_waves = chunks.len();
                self.resolver.preflight_component(&doc, total_waves).await?;
                self.quota_gate.check_and_consume(total_waves).await?;

                let mut pin_buckets: HashMap<String, Vec<Value>> = HashMap::new();
                for (wave_idx, chunk) in chunks.into_iter().enumerate() {
                    let mut wave_inputs = inputs.clone();
                    wave_inputs.insert(cfg.iterable_pin_name.clone(), Value::Array(chunk));
                    match self
                        .execute_single(
                            &doc,
                            &run_id,
                            wave_inputs,
                            Some(wave_idx),
                            Some(total_waves),
                            &cancel,
                        )
                        .await
                    {
                        Ok(wave_out) => {
                            if let Some(ref tx) = item_tx {
                                let _ = tx.send(wave_out.clone());
                            }
                            for (pin_id, pin_val) in wave_out {
                                let bucket = pin_buckets.entry(pin_id).or_default();
                                match pin_val {
                                    Value::Array(arr) => bucket.extend(arr),
                                    other => bucket.push(other),
                                }
                            }
                        }
                        Err(err) => {
                            if !cfg.skip_on_error {
                                return Err(err);
                            }
                        }
                    }
                }

                let mut gathered = HashMap::new();
                for (k, v) in pin_buckets {
                    gathered.insert(k, Value::Array(v));
                }
                return Ok(gathered);
            }

            let total_items = items_vec.len();
            self.resolver.preflight_component(&doc, total_items).await?;
            self.quota_gate.check_and_consume(total_items).await?;

            let iterable_pin = cfg.iterable_pin_name.clone();
            let orch = self.clone();
            let doc_clone = doc.clone();
            let run_id_clone = run_id.clone();
            let cancel_clone = cancel.clone();

            let batch_res = execute_batch_concurrent(cfg, inputs, move |idx, item_val, mut item_inputs| {
                let orch = orch.clone();
                let doc = doc_clone.clone();
                let run_id = run_id_clone.clone();
                let cancel = cancel_clone.clone();
                let iterable_pin = iterable_pin.clone();
                let tx_clone = item_tx.clone();
                async move {
                    item_inputs.insert(iterable_pin, item_val);
                    let single_res = orch
                        .execute_single(&doc, &run_id, item_inputs, Some(idx), Some(total_items), &cancel)
                        .await
                        .map_err(|e| e.to_string())?;
                    if let Some(tx) = tx_clone {
                        let _ = tx.send(single_res.clone());
                    }
                    Ok(single_res)
                }
            })
            .await
            .map_err(|e| anyhow::anyhow!(e))?;

            Ok(batch_res.gathered_outputs)
        } else {
            self.resolver.preflight_component(&doc, 1).await?;
            self.quota_gate.check_and_consume(1).await?;
            let single_res = self
                .execute_single(&doc, &run_id, inputs, None, None, &cancel)
                .await?;
            if let Some(tx) = item_tx {
                let _ = tx.send(single_res.clone());
            }
            Ok(single_res)
        }
    }

    /// Chạy 1 lượt đơn lẻ của Component Pipe từ `Start` tới `End`.
    pub async fn execute_single(
        &self,
        doc: &DagPipelineDocument,
        run_id: &str,
        runtime_inputs: HashMap<String, Value>,
        batch_index: Option<usize>,
        batch_total: Option<usize>,
        cancel: &CancellationToken,
    ) -> Result<HashMap<String, Value>> {
        if let Some(unified_outputs) = self
            .try_execute_unified_dcc_stage(
                doc,
                run_id,
                &runtime_inputs,
                batch_index,
                batch_total,
                cancel,
            )
            .await?
        {
            return Ok(unified_outputs);
        }

        let mut scheduler = DagScheduler::new(doc.clone());
        let mut final_outputs: HashMap<String, Value> = HashMap::new();
        let mut join_set: JoinSet<Result<(String, HashMap<String, Value>)>> = JoinSet::new();

        loop {
            if cancel.is_cancelled() {
                join_set.abort_all();
                anyhow::bail!("Component '{}' execution cancelled", doc.name);
            }

            while let Some(node_def) = scheduler.pop_ready_node() {
                let tool_lower = node_def.tool.to_lowercase();

                // 1. Start Node: nạp runtime_inputs đè lên defaults trong YAML
                if tool_lower == "start" || tool_lower == "local:start" || node_def.id == "start" {
                    let mut start_outputs = node_def.inputs.clone();
                    for (k, v) in &runtime_inputs {
                        start_outputs.insert(k.clone(), v.clone());
                    }
                    scheduler.mark_node_completed(&node_def.id, start_outputs);
                    continue;
                }

                // 2. End / Return Node: thu thập kết quả đầu ra của Component
                if tool_lower == "end"
                    || tool_lower == "local:end"
                    || tool_lower == "return"
                    || tool_lower == "local:return"
                    || node_def.id == "end"
                    || node_def.id == "return"
                {
                    let mut end_inputs = node_def.inputs.clone();
                    let wired = scheduler.resolve_node_inputs(&node_def.id);
                    for (k, v) in wired {
                        end_inputs.insert(k, v);
                    }
                    final_outputs = end_inputs;
                    scheduler.mark_node_completed(&node_def.id, HashMap::new());
                    continue;
                }

                // Gom inputs cho node (YAML defaults + wired edges từ Blackboard trong DagScheduler)
                let resolved_inputs = scheduler.resolve_node_inputs(&node_def.id);

                // 3. Constant Node: tra ResolvedConstantSpec từ Bundle/Resolver, không đoán pin
                if tool_lower.starts_with("local:constant:") || tool_lower == "constant" {
                    let spec = self
                        .resolver
                        .resolve_constant_spec(&node_def.tool)?
                        .ok_or_else(|| {
                            anyhow::anyhow!(
                                "Constant '{}' not found in ExecutionBundle",
                                node_def.tool
                            )
                        })?;
                    let outputs = execute_constant_node(&node_def.tool, &spec, &resolved_inputs)?;

                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            node_type: node_def.tool.clone(),
                            label: node_def.label.clone(),
                            batch_index,
                            batch_total,
                        })
                        .await;

                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            succeeded: true,
                            outputs: Some(outputs.clone()),
                            error_message: None,
                            duration_ms: 0,
                        })
                        .await;

                    scheduler.mark_node_completed(&node_def.id, outputs);
                    continue;
                }

                // 4. Pure Nodes (MakeStruct, BreakStruct, Joint, Constant) -> chạy in-memory (< 1ms)
                if let PureNodeResult::Outputs(outputs) = execute_pure_node(&node_def.tool, &resolved_inputs) {
                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            node_type: node_def.tool.clone(),
                            label: node_def.label.clone(),
                            batch_index,
                            batch_total,
                        })
                        .await;

                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            succeeded: true,
                            outputs: Some(outputs.clone()),
                            error_message: None,
                            duration_ms: 0,
                        })
                        .await;

                    scheduler.mark_node_completed(&node_def.id, outputs);
                    continue;
                }

                // 5. Exec Node (Python / Blender / Unreal): spawn lên JoinSet để chạy song song các nhánh độc lập
                let dispatcher = self.dispatcher.clone();
                let resolver = self.resolver.clone();
                let event_sink = self.event_sink.clone();
                let run_id_owned = run_id.to_string();
                let pipeline_name = doc.name.clone();
                let default_executor = doc.executor.clone();

                join_set.spawn(async move {
                    Self::run_exec_node(
                        dispatcher,
                        resolver,
                        event_sink,
                        &run_id_owned,
                        &pipeline_name,
                        default_executor.as_deref(),
                        node_def,
                        resolved_inputs,
                        batch_index,
                        batch_total,
                    )
                    .await
                });
            }

            if scheduler.is_completed() {
                break;
            }

            if join_set.is_empty() {
                anyhow::bail!(
                    "DAG deadlock detected in component '{}' (unresolved dependencies remain)",
                    doc.name
                );
            }

            tokio::select! {
                _ = cancel.cancelled() => {
                    join_set.abort_all();
                    anyhow::bail!("Component '{}' execution cancelled", doc.name);
                }
                Some(joined) = join_set.join_next() => {
                    let (node_id, outputs) = joined.context("Component node task panicked")??;
                    scheduler.mark_node_completed(&node_id, outputs);
                }
            }
        }

        Ok(final_outputs)
    }

    /// Nếu Component Pipe chạy trên 1 DCC host duy nhất (`blender` hoặc `unreal`, có thể xen kẽ
    /// node `python` thuần và Pure nodes), đóng gói toàn bộ thành 1 `StageTaskMessage` duy nhất
    /// chạy nối tiếp `step 1..n` trong cùng tiến trình DCC đó.
    async fn try_execute_unified_dcc_stage(
        &self,
        doc: &DagPipelineDocument,
        run_id: &str,
        runtime_inputs: &HashMap<String, Value>,
        batch_index: Option<usize>,
        batch_total: Option<usize>,
        cancel: &CancellationToken,
    ) -> Result<Option<HashMap<String, Value>>> {
        let is_start_node = |n: &DagNodeDefinition| {
            let t = n.tool.to_lowercase();
            t == "start" || t == "local:start" || n.id == "start"
        };
        let is_end_node = |n: &DagNodeDefinition| {
            let t = n.tool.to_lowercase();
            t == "end" || t == "local:end" || t == "return" || t == "local:return" || n.id == "end" || n.id == "return"
        };
        let is_pure_node = |n: &DagNodeDefinition| {
            !matches!(execute_pure_node(&n.tool, &HashMap::new()), PureNodeResult::NotPure)
        };

        // Kiểm tra xem các Exec nodes có dùng chung 1 DCC host (blender hoặc unreal), cho phép python chạy ké
        let mut resolved_execs: HashMap<String, (String, Option<String>, String, HashMap<String, Value>, Vec<String>)> = HashMap::new();
        let mut host_dcc_executor: Option<String> = None;
        for node in &doc.nodes {
            if is_start_node(node) || is_end_node(node) || is_pure_node(node) {
                continue;
            }
            let resolved = match self.resolver.resolve_script(&node.tool) {
                Ok(r) => (
                    r.full_path.to_string_lossy().to_string(),
                    r.inline_source,
                    node.executor.clone().unwrap_or(r.executor),
                    r.default_inputs,
                    r.requirements,
                ),
                Err(_) => {
                    if let Some(meta_path) = node.metadata.get("script_path").and_then(|v| v.as_str()) {
                        let ex = node
                            .executor
                            .clone()
                            .or_else(|| doc.executor.clone())
                            .unwrap_or_else(|| "python".to_string());
                        (meta_path.to_string(), None, ex, HashMap::new(), Vec::new())
                    } else {
                        return Ok(None);
                    }
                }
            };
            let exec_lower = resolved.2.to_lowercase();
            if exec_lower != "python" {
                match &host_dcc_executor {
                    Some(existing) if existing != &exec_lower => return Ok(None),
                    None => host_dcc_executor = Some(exec_lower),
                    _ => {}
                }
            }
            resolved_execs.insert(node.id.clone(), resolved);
        }

        let Some(target_executor) = host_dcc_executor else {
            return Ok(None);
        };
        if target_executor != "blender" && target_executor != "unreal" {
            return Ok(None);
        }

        let mut scheduler = DagScheduler::new(doc.clone());
        let mut start_outputs_by_node: HashMap<String, HashMap<String, Value>> = HashMap::new();
        let mut end_nodes: Vec<DagNodeDefinition> = Vec::new();
        let mut steps: Vec<StepExecution> = Vec::new();

        while let Some(node_def) = scheduler.pop_ready_node() {
            if is_start_node(&node_def) {
                let mut start_outputs = node_def.inputs.clone();
                for (k, v) in runtime_inputs {
                    start_outputs.insert(k.clone(), v.clone());
                }
                start_outputs_by_node.insert(node_def.id.clone(), start_outputs.clone());
                scheduler.mark_node_completed(&node_def.id, start_outputs);
                continue;
            }

            if is_end_node(&node_def) {
                end_nodes.push(node_def.clone());
                scheduler.mark_node_completed(&node_def.id, HashMap::new());
                continue;
            }

            let is_pure = is_pure_node(&node_def);
            let mut inputs = HashMap::new();
            let mut script_path = String::new();
            let mut inline_source: Option<String> = None;
            let mut dependencies = Vec::new();

            if !is_pure {
                if let Some((path, inline_src, _exec, defaults, deps)) = resolved_execs.get(&node_def.id) {
                    script_path = path.clone();
                    inline_source = inline_src.clone();
                    dependencies = deps.clone();
                    for (k, v) in defaults {
                        inputs.insert(k.clone(), v.clone());
                    }
                }
            }

            for (k, v) in &node_def.inputs {
                inputs.insert(k.clone(), v.clone());
            }

            let tool_lower = node_def.tool.to_lowercase();
            if is_pure && (tool_lower.starts_with("local:constant:") || tool_lower == "constant") {
                let spec = self
                    .resolver
                    .resolve_constant_spec(&node_def.tool)?
                    .ok_or_else(|| {
                        anyhow::anyhow!(
                            "Constant '{}' not found in ExecutionBundle",
                            node_def.tool
                        )
                    })?;
                for (pin_id, val) in spec.outputs {
                    inputs.entry(pin_id).or_insert(val);
                }
            }

            let mut input_mappings = Vec::new();
            for (target_pin, src_node, src_pin) in scheduler.incoming_connections(&node_def.id) {
                if let Some(s_outs) = start_outputs_by_node.get(&src_node) {
                    if let Some(val) = s_outs.get(&src_pin) {
                        inputs.insert(target_pin, val.clone());
                    }
                } else {
                    input_mappings.push(StepInputMapping {
                        pin_key: target_pin,
                        source_kind: "node_output".to_string(),
                        source_node_id: Some(src_node),
                        source_pin_key: src_pin,
                        literal_value: None,
                    });
                }
            }

            steps.push(StepExecution {
                step_execution_id: node_def.id.clone(),
                step_type: if is_pure { "pure".to_string() } else { "script".to_string() },
                name: node_def.label.clone().unwrap_or_else(|| node_def.id.clone()),
                script_path,
                inline_source,
                script_url: None,
                script_hash: None,
                entry_point: if is_pure { Some(node_def.tool.clone()) } else { None },
                arguments: String::new(),
                order: steps.len() as i32,
                input_mappings,
                params: Vec::new(),
                inputs,
                outputs: Vec::new(),
                dependencies,
            });

            scheduler.mark_node_completed(&node_def.id, HashMap::new());
        }

        if !scheduler.is_completed() {
            return Ok(None);
        }

        if cancel.is_cancelled() {
            anyhow::bail!("Component '{}' execution cancelled", doc.name);
        }

        let stage_id = match batch_index {
            Some(idx) => format!("{}_{}_b{}", run_id, target_executor, idx),
            None => format!("{}_{}", run_id, target_executor),
        };

        let task = StageTaskMessage {
            stage_execution_id: stage_id,
            pipeline_execution_id: run_id.to_string(),
            pipeline_id: doc.name.clone(),
            stage_id: format!("{}_stage", target_executor),
            executor: target_executor.clone(),
            access_token: String::new(),
            grpc_endpoint: String::new(),
            steps,
            resolved_data: HashMap::new(),
            environment_config: if target_executor == "unreal" {
                HashMap::from([("keep_alive_minutes".to_string(), serde_json::json!(5))])
            } else {
                HashMap::new()
            },
            site_packages_path: None,
        };

        let stage_result = tokio::select! {
            _ = cancel.cancelled() => {
                anyhow::bail!("Component '{}' execution cancelled", doc.name);
            }
            res = self.dispatcher.dispatch_stage(task) => res?,
        };

        let mut outputs_by_node: HashMap<String, HashMap<String, Value>> = HashMap::new();
        for step_res in &stage_result.step_results {
            outputs_by_node.insert(step_res.step_execution_id.clone(), step_res.outputs.clone());
        }

        if !stage_result.succeeded {
            let err_msg = stage_result
                .error_message
                .or_else(|| {
                    stage_result
                        .step_results
                        .iter()
                        .find(|s| !s.succeeded)
                        .and_then(|s| s.error_message.clone())
                })
                .unwrap_or_else(|| format!("Blender stage in '{}' failed", doc.name));
            anyhow::bail!(err_msg);
        }

        let mut final_outputs: HashMap<String, Value> = HashMap::new();
        for end_node in &end_nodes {
            for (k, v) in &end_node.inputs {
                final_outputs.insert(k.clone(), v.clone());
            }
            for (target_pin, src_node, src_pin) in scheduler.incoming_connections(&end_node.id) {
                if let Some(val) = start_outputs_by_node.get(&src_node).and_then(|m| m.get(&src_pin)) {
                    final_outputs.insert(target_pin, val.clone());
                } else if let Some(val) = outputs_by_node.get(&src_node).and_then(|m| m.get(&src_pin)) {
                    final_outputs.insert(target_pin, val.clone());
                }
            }
        }

        let _ = (batch_total,);
        Ok(Some(final_outputs))
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_exec_node(
        dispatcher: Arc<StageDispatcher>,
        resolver: Arc<dyn ResourceResolver>,
        event_sink: Arc<dyn EventSink>,
        run_id: &str,
        pipeline_name: &str,
        pipeline_default_executor: Option<&str>,
        node_def: DagNodeDefinition,
        mut resolved_inputs: HashMap<String, Value>,
        batch_index: Option<usize>,
        batch_total: Option<usize>,
    ) -> Result<(String, HashMap<String, Value>)> {
        let started_at = Instant::now();

        let _ = event_sink
            .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                run_id: run_id.to_string(),
                node_id: node_def.id.clone(),
                node_type: node_def.tool.clone(),
                label: node_def.label.clone(),
                batch_index,
                batch_total,
            })
            .await;

        // Resolve script path & executor từ workspace.db (hoặc fallback từ metadata nếu test)
        let (script_path, inline_source, executor, script_defaults, dependencies) =
            match resolver.resolve_script(&node_def.tool) {
                Ok(resolved) => (
                    resolved.full_path.to_string_lossy().to_string(),
                    resolved.inline_source,
                    node_def
                        .executor
                        .clone()
                        .unwrap_or(resolved.executor),
                    resolved.default_inputs,
                    resolved.requirements,
                ),
                Err(resolve_err) => {
                    if let Some(meta_path) = node_def.metadata.get("script_path").and_then(|v| v.as_str()) {
                        (
                            meta_path.to_string(),
                            None,
                            node_def
                                .executor
                                .clone()
                                .or_else(|| pipeline_default_executor.map(|s| s.to_string()))
                                .unwrap_or_else(|| "python".to_string()),
                            HashMap::new(),
                            Vec::new(),
                        )
                    } else {
                        let duration_ms = started_at.elapsed().as_millis() as u64;
                        let err_msg = resolve_err.to_string();
                        let _ = event_sink
                            .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                                run_id: run_id.to_string(),
                                node_id: node_def.id.clone(),
                                succeeded: false,
                                outputs: None,
                                error_message: Some(err_msg.clone()),
                                duration_ms,
                            })
                            .await;
                        return Err(resolve_err);
                    }
                }
            };

        for (k, v) in script_defaults {
            resolved_inputs.entry(k).or_insert(v);
        }

        let stage_id = match batch_index {
            Some(idx) => format!("{}_{}_b{}", run_id, node_def.id, idx),
            None => format!("{}_{}", run_id, node_def.id),
        };

        let task = StageTaskMessage {
            stage_execution_id: stage_id,
            pipeline_execution_id: run_id.to_string(),
            pipeline_id: pipeline_name.to_string(),
            stage_id: node_def.id.clone(),
            executor: executor.clone(),
            access_token: String::new(),
            grpc_endpoint: String::new(),
            steps: vec![StepExecution {
                step_execution_id: node_def.id.clone(),
                step_type: "script".to_string(),
                name: node_def.label.clone().unwrap_or_else(|| node_def.id.clone()),
                script_path,
                inline_source,
                script_url: None,
                script_hash: None,
                entry_point: None,
                arguments: String::new(),
                order: 0,
                input_mappings: Vec::new(),
                params: Vec::new(),
                inputs: resolved_inputs,
                outputs: Vec::new(),
                dependencies,
            }],
            resolved_data: HashMap::new(),
            environment_config: if executor.eq_ignore_ascii_case("unreal") {
                HashMap::from([(
                    "keep_alive_minutes".to_string(),
                    serde_json::json!(5),
                )])
            } else {
                HashMap::new()
            },
            site_packages_path: None,
        };

        let stage_result = dispatcher.dispatch_stage(task).await?;
        let duration_ms = started_at.elapsed().as_millis() as u64;

        if !stage_result.succeeded {
            let err_msg = stage_result
                .error_message
                .or_else(|| {
                    stage_result
                        .step_results
                        .first()
                        .and_then(|s| s.error_message.clone())
                })
                .unwrap_or_else(|| format!("Node '{}' failed", node_def.id));

            let _ = event_sink
                .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                    run_id: run_id.to_string(),
                    node_id: node_def.id.clone(),
                    succeeded: false,
                    outputs: None,
                    error_message: Some(err_msg.clone()),
                    duration_ms,
                })
                .await;

            anyhow::bail!(err_msg);
        }

        let outputs = stage_result
            .step_results
            .into_iter()
            .next()
            .map(|s| s.outputs)
            .unwrap_or_default();

        let _ = event_sink
            .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                run_id: run_id.to_string(),
                node_id: node_def.id.clone(),
                succeeded: true,
                outputs: Some(outputs.clone()),
                error_message: None,
                duration_ms,
            })
            .await;

        Ok((node_def.id, outputs))
    }
}

