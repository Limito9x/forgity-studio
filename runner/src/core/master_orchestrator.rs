use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use super::batch::BatchExecutionConfig;
use super::component_orchestrator::ComponentOrchestrator;
use super::dag::{DagNodeDefinition, DagPipelineDocument, DagScheduler};
use super::pure_nodes::{execute_pure_node, PureNodeResult};
use super::traits::{EventSink, ResourceResolver, RunnerExecutionEvent};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownstreamWaveState {
    Free,
    Busy,
    Completed,
}

#[derive(Debug)]
struct JointStreamSession {
    joint_def: DagNodeDefinition,
    downstream_def: DagNodeDefinition,
    target_data_pin: String,
    take_size: usize,
    upstream_data_wires: Vec<(String, String)>, // (source_node_id, source_pin_id)
    upstream_nodes: HashSet<String>,
    completed_upstreams: HashSet<String>,
    streamed_upstreams: HashSet<String>,
    buffer: VecDeque<Value>,
    all_dispatched_items: Vec<Value>,
    state: DownstreamWaveState,
    wave_index: usize,
    accumulated_outputs: HashMap<String, Vec<Value>>,
    started_emitted: bool,
    started_at: Instant,
}

enum MasterTaskOutcome {
    StandardNode {
        node_id: String,
        outputs: HashMap<String, Value>,
    },
    JointWave {
        joint_id: String,
        outputs: HashMap<String, Value>,
    },
}

fn is_joint_tool(tool_lower: &str) -> bool {
    tool_lower == "joint"
        || tool_lower == "local:joint"
        || tool_lower == "merge_array"
        || tool_lower == "mergearray"
        || tool_lower == "concatarray"
        || tool_lower.contains(":joint")
}

fn extract_take_size(node_def: &DagNodeDefinition) -> usize {
    node_def
        .inputs
        .get("take")
        .or_else(|| node_def.metadata.get("take"))
        .and_then(|v| {
            v.as_u64()
                .or_else(|| v.as_str().and_then(|s| s.trim().parse::<u64>().ok()))
        })
        .unwrap_or(10) as usize
}

fn build_joint_stream_sessions(doc: &DagPipelineDocument) -> HashMap<String, JointStreamSession> {
    let mut nodes_by_id: HashMap<String, DagNodeDefinition> = HashMap::new();
    for n in &doc.nodes {
        nodes_by_id.insert(n.id.clone(), n.clone());
    }

    let mut sessions = HashMap::new();

    for node in &doc.nodes {
        if !is_joint_tool(&node.tool.to_lowercase()) {
            continue;
        }
        let take_size = extract_take_size(node);
        if take_size == 0 {
            continue;
        }

        // Tìm các cạnh đi vào Joint
        let mut upstream_data_wires = Vec::new();
        let mut upstream_nodes = HashSet::new();
        for edge in &doc.edges {
            let from_parts: Vec<&str> = edge.from.splitn(2, '.').collect();
            let to_parts: Vec<&str> = edge.to.splitn(2, '.').collect();
            if from_parts.len() == 2 && to_parts.len() == 2 && to_parts[0] == node.id {
                let src_node = from_parts[0].to_string();
                let src_pin = from_parts[1].to_string();
                let dst_pin = to_parts[1].to_lowercase();
                upstream_nodes.insert(src_node.clone());
                if dst_pin != "exec_in" && dst_pin != "exec" {
                    upstream_data_wires.push((src_node, src_pin));
                }
            }
        }

        if upstream_data_wires.is_empty() {
            continue;
        }

        // Tìm Component Node phía sau nhận mảng dữ liệu từ Joint
        let mut downstream_match: Option<(DagNodeDefinition, String)> = None;
        for edge in &doc.edges {
            let from_parts: Vec<&str> = edge.from.splitn(2, '.').collect();
            let to_parts: Vec<&str> = edge.to.splitn(2, '.').collect();
            if from_parts.len() == 2 && to_parts.len() == 2 && from_parts[0] == node.id {
                let src_pin = from_parts[1].to_lowercase();
                let dst_node_id = to_parts[0];
                let dst_pin = to_parts[1];
                if src_pin != "exec_out" && src_pin != "exec" && dst_pin != "exec_in" && dst_pin != "exec" {
                    if let Some(dst_def) = nodes_by_id.get(dst_node_id) {
                        if dst_def.tool.to_lowercase().starts_with("local:component:") {
                            downstream_match = Some((dst_def.clone(), dst_pin.to_string()));
                            break;
                        }
                    }
                }
            }
        }

        if let Some((downstream_def, target_data_pin)) = downstream_match {
            sessions.insert(
                node.id.clone(),
                JointStreamSession {
                    joint_def: node.clone(),
                    downstream_def,
                    target_data_pin,
                    take_size,
                    upstream_data_wires,
                    upstream_nodes,
                    completed_upstreams: HashSet::new(),
                    streamed_upstreams: HashSet::new(),
                    buffer: VecDeque::new(),
                    all_dispatched_items: Vec::new(),
                    state: DownstreamWaveState::Free,
                    wave_index: 0,
                    accumulated_outputs: HashMap::new(),
                    started_emitted: false,
                    started_at: Instant::now(),
                },
            );
        }
    }

    sessions
}

fn push_value_into_buffer(buffer: &mut VecDeque<Value>, val: &Value) {
    match val {
        Value::Array(arr) => {
            for item in arr {
                if !item.is_null() {
                    buffer.push_back(item.clone());
                }
            }
        }
        Value::Null => {}
        other => {
            buffer.push_back(other.clone());
        }
    }
}

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
        let mut join_set: JoinSet<Result<MasterTaskOutcome>> = JoinSet::new();
        let (stream_tx, mut stream_rx) = mpsc::unbounded_channel::<(String, HashMap<String, Value>)>();

        let mut joint_sessions = build_joint_stream_sessions(doc);
        let managed_downstream_ids: HashSet<String> = joint_sessions
            .values()
            .map(|s| s.downstream_def.id.clone())
            .collect();

        loop {
            if cancel.is_cancelled() {
                join_set.abort_all();
                anyhow::bail!("Master pipeline '{}' execution cancelled", doc.name);
            }

            while let Some(node_def) = scheduler.pop_ready_node() {
                // Nếu node này là Joint hoặc Downstream Component đang được điều phối bởi JointStreamSession,
                // vòng đời của nó do máy trạng thái FREE/BUSY/COMPLETED quản lý.
                if joint_sessions.contains_key(&node_def.id)
                    || managed_downstream_ids.contains(&node_def.id)
                {
                    continue;
                }

                let tool_lower = node_def.tool.to_lowercase();

                // 1. Start Node
                if tool_lower == "start" || tool_lower == "local:start" || node_def.id == "start" {
                    let mut start_outputs = node_def.inputs.clone();
                    for (k, v) in &runtime_inputs {
                        start_outputs.insert(k.clone(), v.clone());
                    }
                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            succeeded: true,
                            outputs: None,
                            error_message: None,
                            duration_ms: 0,
                        })
                        .await;
                    self.notify_upstream_completed(
                        &node_def.id,
                        &start_outputs,
                        &mut joint_sessions,
                    );
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
                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                            run_id: run_id.to_string(),
                            node_id: node_def.id.clone(),
                            succeeded: true,
                            outputs: None,
                            error_message: None,
                            duration_ms: 0,
                        })
                        .await;
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

                    self.notify_upstream_completed(
                        &node_def.id,
                        &resolved_inputs,
                        &mut joint_sessions,
                    );
                    scheduler.mark_node_completed(&node_def.id, resolved_inputs);
                    continue;
                }

                // 4. Joint / Barrier Merge (chế độ không gắn streaming component hoặc take = 0)
                if is_joint_tool(&tool_lower) {
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

                    self.notify_upstream_completed(&node_def.id, &outputs, &mut joint_sessions);
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

                    // Nếu node này dẫn dữ liệu vào một JointStreamSession, gắn kênh phát từng item hoàn thành
                    let feeds_joint = joint_sessions
                        .values()
                        .any(|s| s.upstream_nodes.contains(&node_def.id));
                    let node_item_tx = if feeds_joint {
                        let (item_tx, mut item_rx) = mpsc::unbounded_channel();
                        let src_id = node_def.id.clone();
                        let forward_tx = stream_tx.clone();
                        tokio::spawn(async move {
                            while let Some(item_out) = item_rx.recv().await {
                                let _ = forward_tx.send((src_id.clone(), item_out));
                            }
                        });
                        Some(item_tx)
                    } else {
                        None
                    };

                    join_set.spawn(async move {
                        let (node_id, outputs) = Self::run_component_node(
                            comp_orch,
                            resolver,
                            event_sink,
                            &master_run_id,
                            node_def,
                            resolved_inputs,
                            node_item_tx,
                            child_cancel,
                        )
                        .await?;
                        Ok(MasterTaskOutcome::StandardNode { node_id, outputs })
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

            // Kiểm tra và kích hoạt các đợt (waves) của JointStreamSession nếu Downstream đang FREE
            self.drive_joint_sessions(
                run_id,
                &mut scheduler,
                &mut joint_sessions,
                &mut join_set,
                &cancel,
            )
            .await?;

            // Đọc lại ready_queue nếu vừa có session chuyển sang COMPLETED và mở khóa End
            if scheduler.has_ready_nodes() {
                continue;
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
                Some((src_node_id, item_outputs)) = stream_rx.recv() => {
                    self.notify_upstream_stream_item(&src_node_id, &item_outputs, &mut joint_sessions);
                    self.drive_joint_sessions(
                        run_id,
                        &mut scheduler,
                        &mut joint_sessions,
                        &mut join_set,
                        &cancel,
                    )
                    .await?;
                }
                Some(joined) = join_set.join_next() => {
                    let outcome = joined.context("Master component task panicked")??;
                    match outcome {
                        MasterTaskOutcome::StandardNode { node_id, outputs } => {
                            self.notify_upstream_completed(&node_id, &outputs, &mut joint_sessions);
                            scheduler.mark_node_completed(&node_id, outputs);
                        }
                        MasterTaskOutcome::JointWave {
                            joint_id,
                            outputs,
                        } => {
                            if let Some(session) = joint_sessions.get_mut(&joint_id) {
                                for (pin_id, pin_val) in outputs {
                                    let bucket = session.accumulated_outputs.entry(pin_id).or_default();
                                    match pin_val {
                                        Value::Array(arr) => bucket.extend(arr),
                                        other => bucket.push(other),
                                    }
                                }
                                // Chuyển trạng thái từ BUSY -> FREE để sẵn sàng nhận đợt tiếp theo (hoặc COMPLETED)
                                session.state = DownstreamWaveState::Free;
                                let _ = self
                                    .event_sink
                                    .emit_pipeline_event(RunnerExecutionEvent::NodeProgress {
                                        run_id: run_id.to_string(),
                                        node_id: session.downstream_def.id.clone(),
                                        status: "waiting".to_string(),
                                        outputs: None,
                                        error_message: None,
                                        batch_index: None,
                                        completed: Some(session.all_dispatched_items.len()),
                                        total: None,
                                    })
                                    .await;
                            }
                        }
                    }
                    self.drive_joint_sessions(
                        run_id,
                        &mut scheduler,
                        &mut joint_sessions,
                        &mut join_set,
                        &cancel,
                    )
                    .await?;
                }
            }
        }

        Ok(final_outputs)
    }

    fn notify_upstream_stream_item(
        &self,
        src_node_id: &str,
        item_outputs: &HashMap<String, Value>,
        joint_sessions: &mut HashMap<String, JointStreamSession>,
    ) {
        for session in joint_sessions.values_mut() {
            if !session.upstream_nodes.contains(src_node_id)
                || session.completed_upstreams.contains(src_node_id)
            {
                continue;
            }
            session.streamed_upstreams.insert(src_node_id.to_string());
            for (wire_node, wire_pin) in &session.upstream_data_wires {
                if wire_node == src_node_id {
                    if let Some(val) = item_outputs.get(wire_pin) {
                        push_value_into_buffer(&mut session.buffer, val);
                    }
                }
            }
        }
    }

    fn notify_upstream_completed(
        &self,
        src_node_id: &str,
        final_outputs: &HashMap<String, Value>,
        joint_sessions: &mut HashMap<String, JointStreamSession>,
    ) {
        for session in joint_sessions.values_mut() {
            if !session.upstream_nodes.contains(src_node_id) {
                continue;
            }
            if !session.streamed_upstreams.contains(src_node_id) {
                for (wire_node, wire_pin) in &session.upstream_data_wires {
                    if wire_node == src_node_id {
                        if let Some(val) = final_outputs.get(wire_pin) {
                            push_value_into_buffer(&mut session.buffer, val);
                        }
                    }
                }
            }
            session.completed_upstreams.insert(src_node_id.to_string());
        }
    }

    async fn drive_joint_sessions(
        &self,
        run_id: &str,
        scheduler: &mut DagScheduler,
        joint_sessions: &mut HashMap<String, JointStreamSession>,
        join_set: &mut JoinSet<Result<MasterTaskOutcome>>,
        cancel: &CancellationToken,
    ) -> Result<()> {
        let joint_ids: Vec<String> = joint_sessions.keys().cloned().collect();
        for joint_id in joint_ids {
            let session = match joint_sessions.get_mut(&joint_id) {
                Some(s) => s,
                None => continue,
            };

            if session.state != DownstreamWaveState::Free {
                continue;
            }

            let all_upstreams_done =
                session.completed_upstreams.len() >= session.upstream_nodes.len();
            let has_full_wave = session.buffer.len() >= session.take_size;

            if !session.buffer.is_empty() && (has_full_wave || all_upstreams_done) {
                if !session.started_emitted {
                    session.started_emitted = true;
                    session.started_at = Instant::now();
                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                            run_id: run_id.to_string(),
                            node_id: session.joint_def.id.clone(),
                            node_type: session.joint_def.tool.clone(),
                            label: session.joint_def.label.clone(),
                            batch_index: None,
                            batch_total: None,
                        })
                        .await;
                    let _ = self
                        .event_sink
                        .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                            run_id: run_id.to_string(),
                            node_id: session.downstream_def.id.clone(),
                            node_type: session.downstream_def.tool.clone(),
                            label: session.downstream_def.label.clone(),
                            batch_index: None,
                            batch_total: None,
                        })
                        .await;
                }

                let pop_count = session.take_size.min(session.buffer.len());
                let mut chunk = Vec::with_capacity(pop_count);
                for _ in 0..pop_count {
                    if let Some(item) = session.buffer.pop_front() {
                        chunk.push(item);
                    }
                }
                session.all_dispatched_items.extend(chunk.clone());
                session.state = DownstreamWaveState::Busy;
                let _ = self
                    .event_sink
                    .emit_pipeline_event(RunnerExecutionEvent::NodeProgress {
                        run_id: run_id.to_string(),
                        node_id: session.downstream_def.id.clone(),
                        status: "running".to_string(),
                        outputs: None,
                        error_message: None,
                        batch_index: Some(session.wave_index),
                        completed: Some(session.all_dispatched_items.len()),
                        total: None,
                    })
                    .await;
                let wave_index = session.wave_index;
                session.wave_index += 1;

                let mut wave_inputs = scheduler.resolve_node_inputs(&session.downstream_def.id);
                wave_inputs.insert(session.target_data_pin.clone(), Value::Array(chunk));

                let comp_orch = self.component_orchestrator.clone();
                let resolver = self.resolver.clone();
                let event_sink = self.event_sink.clone();
                let master_run_id = run_id.to_string();
                let downstream_def = session.downstream_def.clone();
                let j_id = session.joint_def.id.clone();
                let child_cancel = cancel.child_token();

                join_set.spawn(async move {
                    let outputs = Self::run_component_wave(
                        comp_orch,
                        resolver,
                        event_sink,
                        &master_run_id,
                        downstream_def,
                        wave_inputs,
                        wave_index,
                        child_cancel,
                    )
                    .await?;
                    Ok(MasterTaskOutcome::JointWave {
                        joint_id: j_id,
                        outputs,
                    })
                });
            } else if session.buffer.is_empty() && all_upstreams_done {
                // Tất cả nhánh phía trước đã hoàn tất và buffer đã cạn -> Chuyển sang COMPLETED
                session.state = DownstreamWaveState::Completed;
                let duration_ms = session.started_at.elapsed().as_millis() as u64;

                let mut joint_outputs = HashMap::new();
                let all_items = Value::Array(session.all_dispatched_items.clone());
                joint_outputs.insert("out".to_string(), all_items.clone());
                joint_outputs.insert("out_1".to_string(), all_items.clone());
                joint_outputs.insert("out_array".to_string(), all_items.clone());
                joint_outputs.insert("output".to_string(), all_items);

                let mut final_downstream_outputs = HashMap::new();
                for (k, v) in &session.accumulated_outputs {
                    final_downstream_outputs.insert(k.clone(), Value::Array(v.clone()));
                }

                let _ = self
                    .event_sink
                    .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                        run_id: run_id.to_string(),
                        node_id: session.joint_def.id.clone(),
                        succeeded: true,
                        outputs: Some(joint_outputs.clone()),
                        error_message: None,
                        duration_ms,
                    })
                    .await;

                let _ = self
                    .event_sink
                    .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                        run_id: run_id.to_string(),
                        node_id: session.downstream_def.id.clone(),
                        succeeded: true,
                        outputs: Some(final_downstream_outputs.clone()),
                        error_message: None,
                        duration_ms,
                    })
                    .await;

                scheduler.mark_node_completed(&session.joint_def.id, joint_outputs);
                scheduler.mark_node_completed(&session.downstream_def.id, final_downstream_outputs);
            }
        }
        Ok(())
    }

    async fn run_component_wave(
        comp_orch: Arc<ComponentOrchestrator>,
        resolver: Arc<dyn ResourceResolver>,
        event_sink: Arc<dyn EventSink>,
        master_run_id: &str,
        node_def: DagNodeDefinition,
        wave_inputs: HashMap<String, Value>,
        wave_index: usize,
        cancel: CancellationToken,
    ) -> Result<HashMap<String, Value>> {
        let comp_doc = resolver
            .resolve_component(&node_def.tool)
            .with_context(|| format!("Failed to resolve component for node '{}'", node_def.id))?;

        let batch_config = extract_batch_config(&node_def);
        let sub_run_id = format!("{}_{}_wave{}", master_run_id, node_def.id, wave_index);

        match comp_orch
            .execute_with_stream(
                Arc::new(comp_doc),
                sub_run_id,
                wave_inputs,
                batch_config,
                None,
                cancel,
            )
            .await
        {
            Ok(outputs) => Ok(outputs),
            Err(err) => {
                let err_msg = err.to_string();
                let _ = event_sink
                    .emit_pipeline_event(RunnerExecutionEvent::NodeCompleted {
                        run_id: master_run_id.to_string(),
                        node_id: node_def.id.clone(),
                        succeeded: false,
                        outputs: None,
                        error_message: Some(err_msg),
                        duration_ms: 0,
                    })
                    .await;
                Err(err)
            }
        }
    }

    async fn run_component_node(
        comp_orch: Arc<ComponentOrchestrator>,
        resolver: Arc<dyn ResourceResolver>,
        event_sink: Arc<dyn EventSink>,
        master_run_id: &str,
        node_def: DagNodeDefinition,
        resolved_inputs: HashMap<String, Value>,
        item_tx: Option<mpsc::UnboundedSender<HashMap<String, Value>>>,
        cancel: CancellationToken,
    ) -> Result<(String, HashMap<String, Value>)> {
        let started_at = Instant::now();
        let batch_config = extract_batch_config(&node_def);
        let batch_total = batch_config.as_ref().and_then(|cfg| {
            match resolved_inputs.get(&cfg.iterable_pin_name) {
                Some(Value::Array(arr)) if !arr.is_empty() => Some(arr.len()),
                _ => None,
            }
        });

        let _ = event_sink
            .emit_pipeline_event(RunnerExecutionEvent::NodeStarted {
                run_id: master_run_id.to_string(),
                node_id: node_def.id.clone(),
                node_type: node_def.tool.clone(),
                label: node_def.label.clone(),
                batch_index: batch_total.map(|_| 0),
                batch_total,
            })
            .await;

        let comp_doc = resolver
            .resolve_component(&node_def.tool)
            .with_context(|| format!("Failed to resolve component for node '{}'", node_def.id))?;

        let sub_run_id = format!("{}_{}", master_run_id, node_def.id);

        // Bọc item_tx để phát NodeProgress (completed / total) lên Master Canvas mỗi khi 1 item hoàn thành
        let wrapped_item_tx = if let Some(total) = batch_total {
            let (prog_tx, mut prog_rx) = mpsc::unbounded_channel::<HashMap<String, Value>>();
            let sink_clone = event_sink.clone();
            let run_id_clone = master_run_id.to_string();
            let nid_clone = node_def.id.clone();
            let fwd_tx = item_tx.clone();
            tokio::spawn(async move {
                let mut done = 0usize;
                while let Some(item_out) = prog_rx.recv().await {
                    done += 1;
                    let _ = sink_clone
                        .emit_pipeline_event(RunnerExecutionEvent::NodeProgress {
                            run_id: run_id_clone.clone(),
                            node_id: nid_clone.clone(),
                            status: "running".to_string(),
                            outputs: None,
                            error_message: None,
                            batch_index: Some(done.saturating_sub(1)),
                            completed: Some(done),
                            total: Some(total),
                        })
                        .await;
                    if let Some(ref tx) = fwd_tx {
                        let _ = tx.send(item_out);
                    }
                }
            });
            Some(prog_tx)
        } else {
            item_tx
        };

        match comp_orch
            .execute_with_stream(
                Arc::new(comp_doc),
                sub_run_id,
                resolved_inputs,
                batch_config,
                wrapped_item_tx,
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
