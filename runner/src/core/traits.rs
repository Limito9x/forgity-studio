use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use tracing::warn;

use super::contracts::{StageResultMessage, StepProgressMessage};
use super::dag::DagPipelineDocument;
use crate::queue::rabbitmq::RabbitMqClient;

/// Sự kiện thực thi pipeline phát ra từ Runner (Local Mode -> stdout JSON-lines -> Tauri -> React Canvas).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RunnerExecutionEvent {
    RunStarted {
        run_id: String,
        pipeline_id: String,
        pipeline_kind: String, // "component" | "master"
    },
    NodeStarted {
        run_id: String,
        node_id: String,
        node_type: String,
        label: Option<String>,
        batch_index: Option<usize>,
        batch_total: Option<usize>,
    },
    NodeProgress {
        run_id: String,
        node_id: String,
        status: String,
        outputs: Option<HashMap<String, Value>>,
        error_message: Option<String>,
        batch_index: Option<usize>,
    },
    NodeCompleted {
        run_id: String,
        node_id: String,
        succeeded: bool,
        outputs: Option<HashMap<String, Value>>,
        error_message: Option<String>,
        duration_ms: u64,
    },
    RunCompleted {
        run_id: String,
        pipeline_id: String,
        succeeded: bool,
        outputs: Option<HashMap<String, Value>>,
        error_message: Option<String>,
        duration_ms: u64,
    },
}

/// Cổng xuất sự kiện thực thi (tách StageDispatcher khỏi RabbitMQ để dùng chung cho Worker Mode & Local Mode).
#[async_trait]
pub trait EventSink: Send + Sync {
    async fn emit_step_progress(&self, msg: &StepProgressMessage) -> Result<()>;
    async fn emit_stage_result(&self, msg: &StageResultMessage) -> Result<()>;
    async fn emit_pipeline_event(&self, event: RunnerExecutionEvent) -> Result<()>;
}

/// EventSink dùng cho chế độ Worker cũ (đẩy message lên RabbitMQ).
pub struct RabbitMqEventSink {
    rabbitmq: RabbitMqClient,
}

impl RabbitMqEventSink {
    pub fn new(rabbitmq: RabbitMqClient) -> Self {
        Self { rabbitmq }
    }
}

#[async_trait]
impl EventSink for RabbitMqEventSink {
    async fn emit_step_progress(&self, msg: &StepProgressMessage) -> Result<()> {
        self.rabbitmq.send_progress(msg).await
    }

    async fn emit_stage_result(&self, msg: &StageResultMessage) -> Result<()> {
        self.rabbitmq.send_result(msg).await
    }

    async fn emit_pipeline_event(&self, _event: RunnerExecutionEvent) -> Result<()> {
        Ok(())
    }
}

/// EventSink dùng cho chế độ Local Run (`forgity-runner run-local --json-events`).
/// In mỗi sự kiện thành đúng 1 dòng JSON ra `stdout` để Tauri đọc realtime.
pub struct StdoutJsonEventSink {
    json_events: bool,
}

impl StdoutJsonEventSink {
    pub fn new(json_events: bool) -> Self {
        Self { json_events }
    }

    fn write_json_line(&self, event: &RunnerExecutionEvent) {
        if !self.json_events {
            return;
        }
        match serde_json::to_string(event) {
            Ok(line) => {
                let mut out = std::io::stdout().lock();
                let _ = writeln!(out, "{}", line);
                let _ = out.flush();
            }
            Err(e) => {
                warn!("[StdoutJsonEventSink] Failed to serialize event: {}", e);
            }
        }
    }
}

#[async_trait]
impl EventSink for StdoutJsonEventSink {
    async fn emit_step_progress(&self, msg: &StepProgressMessage) -> Result<()> {
        self.write_json_line(&RunnerExecutionEvent::NodeProgress {
            run_id: msg.pipeline_execution_id.clone(),
            node_id: msg.step_execution_id.clone(),
            status: msg.status.clone(),
            outputs: msg.outputs.clone(),
            error_message: msg.error_message.clone(),
            batch_index: None,
        });
        Ok(())
    }

    async fn emit_stage_result(&self, _msg: &StageResultMessage) -> Result<()> {
        // Local Orchestrator nhận trực tiếp StageResultMessage từ hàm dispatch_stage()
        Ok(())
    }

    async fn emit_pipeline_event(&self, event: RunnerExecutionEvent) -> Result<()> {
        self.write_json_line(&event);
        Ok(())
    }
}

/// EventSink rỗng dành cho Unit Test hoặc chạy ngầm không cần xuất event.
pub struct NullEventSink;

#[async_trait]
impl EventSink for NullEventSink {
    async fn emit_step_progress(&self, _msg: &StepProgressMessage) -> Result<()> {
        Ok(())
    }

    async fn emit_stage_result(&self, _msg: &StageResultMessage) -> Result<()> {
        Ok(())
    }

    async fn emit_pipeline_event(&self, _event: RunnerExecutionEvent) -> Result<()> {
        Ok(())
    }
}

/// Cổng kiểm tra Quota trước khi chạy Component/Master (mặc định Unlimited ở Local Dev).
#[async_trait]
pub trait QuotaGate: Send + Sync {
    async fn check_and_consume(&self, unit_count: usize) -> Result<()>;
}

pub struct UnlimitedQuotaGate;

#[async_trait]
impl QuotaGate for UnlimitedQuotaGate {
    async fn check_and_consume(&self, _unit_count: usize) -> Result<()> {
        Ok(())
    }
}

/// Thông tin Script đã được resolve (từ Client DTO hoặc Workspace SQLite).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedScript {
    pub key: String,
    pub executor: String,
    pub full_path: PathBuf,
    #[serde(default)]
    pub requirements: Vec<String>,
    #[serde(default)]
    pub default_inputs: HashMap<String, Value>,
}

/// Contract đã materialize của 1 Constant node (sinh bởi Bundle Compiler, không cần đoán pin ở Runner).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConstantSpec {
    pub outputs: HashMap<String, Value>,
    #[serde(default)]
    pub template_vars: Vec<String>,
}

/// Cổng tra cứu tài nguyên cho Engine (tách Orchestrator khỏi nguồn dữ liệu: Bundle DTO vs SQLite vs Cloud).
pub trait ResourceResolver: Send + Sync {
    fn resolve_script(&self, tool_ref: &str) -> Result<ResolvedScript>;
    fn resolve_component(&self, component_ref: &str) -> Result<DagPipelineDocument>;
    fn resolve_constant_spec(&self, constant_ref: &str) -> Result<Option<ResolvedConstantSpec>>;
}
