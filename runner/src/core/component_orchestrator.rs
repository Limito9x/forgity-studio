use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use super::batch::{execute_batch_concurrent, BatchExecutionConfig};
use super::contracts::{StageTaskMessage, StepExecution};
use super::dag::{DagNodeDefinition, DagPipelineDocument, DagScheduler};
use super::dispatcher::StageDispatcher;
use super::pure_nodes::{execute_pure_node, PureNodeResult};
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
        if let Some(cfg) = batch_config {
            let item_count = match inputs.get(&cfg.iterable_pin_name) {
                Some(Value::Array(arr)) => arr.len().max(1),
                Some(_) => 1,
                None => 0,
            };
            self.quota_gate.check_and_consume(item_count).await?;

            let iterable_pin = cfg.iterable_pin_name.clone();
            let total_items = match inputs.get(&iterable_pin) {
                Some(Value::Array(arr)) => arr.len(),
                Some(_) => 1,
                None => 0,
            };

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
                async move {
                    item_inputs.insert(iterable_pin, item_val);
                    orch.execute_single(&doc, &run_id, item_inputs, Some(idx), Some(total_items), &cancel)
                        .await
                        .map_err(|e| e.to_string())
                }
            })
            .await
            .map_err(|e| anyhow::anyhow!(e))?;

            Ok(batch_res.gathered_outputs)
        } else {
            self.quota_gate.check_and_consume(1).await?;
            self.execute_single(&doc, &run_id, inputs, None, None, &cancel)
                .await
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

                // 2. End Node: thu thập kết quả đầu ra của Component
                if tool_lower == "end" || tool_lower == "local:end" || node_def.id == "end" {
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
                let mut resolved_inputs = scheduler.resolve_node_inputs(&node_def.id);

                // 3. Constant Node: tra workspace.db nếu chưa có giá trị override
                if tool_lower.starts_with("local:constant:") || tool_lower == "constant" {
                    if !resolved_inputs.contains_key("value") {
                        if let Ok(Some(db_val)) = self.resolver.resolve_constant(&node_def.tool) {
                            resolved_inputs.insert("value".to_string(), db_val);
                        }
                    }
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
        let (script_path, executor, script_defaults, dependencies) =
            match resolver.resolve_script(&node_def.tool) {
                Ok(resolved) => (
                    resolved.full_path.to_string_lossy().to_string(),
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
            executor,
            access_token: String::new(),
            grpc_endpoint: String::new(),
            steps: vec![StepExecution {
                step_execution_id: node_def.id.clone(),
                step_type: "script".to_string(),
                name: node_def.label.clone().unwrap_or_else(|| node_def.id.clone()),
                script_path,
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
            environment_config: HashMap::new(),
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
