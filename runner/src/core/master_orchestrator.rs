use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use super::batch::BatchExecutionConfig;
use super::component_orchestrator::ComponentOrchestrator;
use super::dag::{DagNodeDefinition, DagPipelineDocument, DagScheduler};
use super::pure_nodes::{execute_pure_node, PureNodeResult};
use super::traits::{EventSink, ResourceResolver, RunnerExecutionEvent};

/// Tầng 2: Điều phối Master Pipeline (`*.pipeline.yaml`).
/// Chỉ điều phối `Start`, `End`, `Sequence`, `Joint` và các Component Batch Nodes (`local:component:*`).
/// Tuyệt đối không xử lý script `.py` lẻ, `MakeStruct`, `BreakStruct` hay `Constant`.
pub struct MasterOrchestrator {
    component_orchestrator: Arc<ComponentOrchestrator>,
    resolver: Arc<dyn ResourceResolver>,
    event_sink: Arc<dyn EventSink>,
}

impl MasterOrchestrator {
    pub fn new(
        component_orchestrator: Arc<ComponentOrchestrator>,
        resolver: Arc<dyn ResourceResolver>,
        event_sink: Arc<dyn EventSink>,
    ) -> Self {
        Self {
            component_orchestrator,
            resolver,
            event_sink,
        }
    }

    pub async fn execute(
        &self,
        doc: &DagPipelineDocument,
        run_id: &str,
        runtime_inputs: HashMap<String, Value>,
        cancel: CancellationToken,
    ) -> Result<HashMap<String, Value>> {
        let mut scheduler = DagScheduler::new(doc.clone());
        let mut final_outputs: HashMap<String, Value> = HashMap::new();
        let mut join_set: JoinSet<Result<(String, HashMap<String, Value>)>> = JoinSet::new();

        loop {
            if cancel.is_cancelled() {
                join_set.abort_all();
                anyhow::bail!("Master pipeline '{}' execution cancelled", doc.name);
            }

            while let Some(node_def) = scheduler.pop_ready_node() {
                let tool_lower = node_def.tool.to_lowercase();

                // 1. Start Node
                if tool_lower == "start" || tool_lower == "local:start" || node_def.id == "start" {
                    let mut start_outputs = node_def.inputs.clone();
                    for (k, v) in &runtime_inputs {
                        start_outputs.insert(k.clone(), v.clone());
                    }
                    scheduler.mark_node_completed(&node_def.id, start_outputs);
                    continue;
                }

                // 2. End / Return Node
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

                let resolved_inputs = scheduler.resolve_node_inputs(&node_def.id);

                // 3. Sequence / Control-flow fan-out: mở khóa toàn bộ các nhánh phụ thuộc để chạy song song
                if tool_lower == "sequence" || tool_lower == "local:sequence" {
                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            node_type: node_def.tool.clone(),
                            label: node_def.label.clone(),
                            batch_index: None,
                            batch_total: None,
                        })
                        .await;

                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            succeeded: true,
                            outputs: Some(resolved_inputs.clone()),
                            error_message: None,
                            duration_ms: 0,
                        })
                        .await;

                    scheduler.mark_node_completed(&node_def.id, resolved_inputs);
                    continue;
                }

                // 4. Joint / Barrier Merge: đợi mọi cạnh vào hoàn tất rồi gom mảng dữ liệu
                if tool_lower == "joint"
                    || tool_lower == "local:joint"
                    || tool_lower == "merge_array"
                    || tool_lower.contains(":joint")
                {
                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            node_type: node_def.tool.clone(),
                            label: node_def.label.clone(),
                            batch_index: None,
                            batch_total: None,
                        })
                        .await;

                    let outputs = match execute_pure_node("joint", &resolved_inputs) {
                        PureNodeResult::Outputs(out) => out,
                        PureNodeResult::NotPure => HashMap::new(),
                    };

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

                // 5. Component Batch Node (`local:component:<slug>`)
                if tool_lower.starts_with("local:component:") {
                    let comp_orch = self.component_orchestrator.clone();
                    let resolver = self.resolver.clone();
                    let event_sink = self.event_sink.clone();
                    let master_run_id = run_id.to_string();
                    let child_cancel = cancel.child_token();

                    join_set.spawn(async move {
                        Self::run_component_node(
                            comp_orch,
                            resolver,
                            event_sink,
                            &master_run_id,
                            node_def,
                            resolved_inputs,
                            child_cancel,
                        )
                        .await
                    });
                    continue;
                }

                // Master Pipeline không được phép chứa script lẻ hay Make/Break Struct/Constant
                anyhow::bail!(
                    "Master pipeline '{}' contains unsupported node '{}' (tool: '{}'). Master pipelines may only orchestrate Start, End, Sequence, Joint, and local:component:* nodes.",
                    doc.name,
                    node_def.id,
                    node_def.tool
                );
            }

            if scheduler.is_completed() {
                break;
            }

            if join_set.is_empty() {
                anyhow::bail!(
                    "DAG deadlock detected in master pipeline '{}' (unresolved dependencies remain)",
                    doc.name
                );
            }

            tokio::select! {
                _ = cancel.cancelled() => {
                    join_set.abort_all();
                    anyhow::bail!("Master pipeline '{}' execution cancelled", doc.name);
                }
                Some(joined) = join_set.join_next() => {
                    let (node_id, outputs) = joined.context("Master component task panicked")??;
                    scheduler.mark_node_completed(&node_id, outputs);
                }
            }
        }

        Ok(final_outputs)
    }

    async fn run_component_node(
        comp_orch: Arc<ComponentOrchestrator>,
        resolver: Arc<dyn ResourceResolver>,
        event_sink: Arc<dyn EventSink>,
        master_run_id: &str,
        node_def: DagNodeDefinition,
        resolved_inputs: HashMap<String, Value>,
        cancel: CancellationToken,
    ) -> Result<(String, HashMap<String, Value>)> {
        let started_at = Instant::now();

        let _ = event_sink
            .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                run_id: master_run_id.to_string(),
                node_id: node_def.id.clone(),
                node_type: node_def.tool.clone(),
                label: node_def.label.clone(),
                batch_index: None,
                batch_total: None,
            })
            .await;

        let comp_doc = resolver
            .resolve_component(&node_def.tool)
            .with_context(|| format!("Failed to resolve component for node '{}'", node_def.id))?;

        let batch_config = extract_batch_config(&node_def);
        let sub_run_id = format!("{}_{}", master_run_id, node_def.id);

        match comp_orch
            .execute(
                Arc::new(comp_doc),
                sub_run_id,
                resolved_inputs,
                batch_config,
                cancel,
            )
            .await
        {
            Ok(outputs) => {
                let duration_ms = started_at.elapsed().as_millis() as u64;
                let _ = event_sink
                    .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                        run_id: master_run_id.to_string(),
                        node_id: node_def.id.clone(),
                        succeeded: true,
                        outputs: Some(outputs.clone()),
                        error_message: None,
                        duration_ms,
                    })
                    .await;
                Ok((node_def.id, outputs))
            }
            Err(err) => {
                let duration_ms = started_at.elapsed().as_millis() as u64;
                let err_msg = err.to_string();
                let _ = event_sink
                    .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                        run_id: master_run_id.to_string(),
                        node_id: node_def.id.clone(),
                        succeeded: false,
                        outputs: None,
                        error_message: Some(err_msg.clone()),
                        duration_ms,
                    })
                    .await;
                Err(err)
            }
        }
    }
}

fn extract_batch_config(node_def: &DagNodeDefinition) -> Option<BatchExecutionConfig> {
    let is_batch = node_def.is_batch
        || node_def
            .metadata
            .get("isBatch")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

    if !is_batch {
        return None;
    }

    let max_concurrency = node_def
        .max_concurrency
        .or_else(|| {
            node_def
                .metadata
                .get("maxConcurrency")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
        })
        .unwrap_or(2)
        .max(1);

    let iterable_pin_name = node_def
        .iterable_pin
        .clone()
        .or_else(|| {
            node_def
                .metadata
                .get("iterablePin")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "items".to_string());

    let skip_on_error = node_def
        .skip_on_error
        .or_else(|| {
            node_def
                .metadata
                .get("skipOnError")
                .and_then(|v| v.as_bool())
        })
        .unwrap_or(true);

    Some(BatchExecutionConfig {
        max_concurrency,
        iterable_pin_name,
        skip_on_error,
    })
}
