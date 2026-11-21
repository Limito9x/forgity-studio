use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{debug, info};

use super::blackboard::Blackboard;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DagNodeDefinition {
    pub id: String,
    pub tool: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub executor: Option<String>,
    #[serde(default)]
    pub inputs: HashMap<String, Value>,
    #[serde(default)]
    pub metadata: HashMap<String, Value>,
    /// Cấu hình nếu node này chạy ở chế độ Batch lặp song song
    #[serde(default)]
    pub is_batch: bool,
    #[serde(default)]
    pub max_concurrency: Option<usize>,
    #[serde(default)]
    pub iterable_pin: Option<String>,
    #[serde(default)]
    pub skip_on_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DagEdgeDefinition {
    pub from: String, // ví dụ "start.output_files" hoặc "node_a.out"
    pub to: String,   // ví dụ "node_b.input_files"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DagPipelineDocument {
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub executor: Option<String>,
    #[serde(default)]
    pub nodes: Vec<DagNodeDefinition>,
    #[serde(default)]
    pub edges: Vec<DagEdgeDefinition>,
}

#[derive(Debug)]
pub struct RuntimeNodeState {
    pub definition: DagNodeDefinition,
    pub remaining_dependencies: usize,
    /// Danh sách các cạnh nối vào node này: Vec<(target_pin, source_node, source_pin)>
    pub incoming_connections: Vec<(String, String, String)>,
    /// Danh sách các node phụ thuộc vào kết quả của node này: Vec<dependent_node_id>
    pub dependents: HashSet<String>,
}

pub struct DagScheduler {
    pub pipeline_doc: DagPipelineDocument,
    pub blackboard: Blackboard,
    nodes_state: HashMap<String, RuntimeNodeState>,
    ready_queue: VecDeque<String>,
    completed_nodes: HashSet<String>,
}

impl DagScheduler {
    /// Khởi tạo DAG Scheduler từ file document pipeline
    pub fn new(doc: DagPipelineDocument) -> Self {
        let blackboard = Blackboard::new();
        let mut nodes_state = HashMap::new();

        // 1. Khởi tạo trạng thái ban đầu cho toàn bộ nodes
        for node in &doc.nodes {
            nodes_state.insert(
                node.id.clone(),
                RuntimeNodeState {
                    definition: node.clone(),
                    remaining_dependencies: 0,
                    incoming_connections: Vec::new(),
                    dependents: HashSet::new(),
                },
            );
        }

        // 2. Phân tích edges để tính toán bậc phụ thuộc và liên kết dây
        for edge in &doc.edges {
            let from_parts: Vec<&str> = edge.from.splitn(2, '.').collect();
            let to_parts: Vec<&str> = edge.to.splitn(2, '.').collect();

            if from_parts.len() == 2 && to_parts.len() == 2 {
                let source_node = from_parts[0];
                let source_pin = from_parts[1];
                let target_node = to_parts[0];
                let target_pin = to_parts[1];

                // Track unique node-to-node dependency so multiple wires (e.g. exec + data)
                // between the same pair of nodes only increment remaining_dependencies once.
                let is_new_dependency = if nodes_state.contains_key(target_node) {
                    if let Some(source_state) = nodes_state.get_mut(source_node) {
                        source_state.dependents.insert(target_node.to_string())
                    } else {
                        false
                    }
                } else {
                    false
                };

                if let Some(target_state) = nodes_state.get_mut(target_node) {
                    if is_new_dependency {
                        target_state.remaining_dependencies += 1;
                    }
                    target_state.incoming_connections.push((
                        target_pin.to_string(),
                        source_node.to_string(),
                        source_pin.to_string(),
                    ));
                }
            }
        }

        // 3. Tìm các node độc lập (remaining_dependencies == 0) để đưa vào Ready Queue
        let mut ready_queue = VecDeque::new();
        for (node_id, state) in &nodes_state {
            if state.remaining_dependencies == 0 {
                ready_queue.push_back(node_id.clone());
            }
        }

        Self {
            pipeline_doc: doc,
            blackboard,
            nodes_state,
            ready_queue,
            completed_nodes: HashSet::new(),
        }
    }

    /// Lấy node tiếp theo sẵn sàng để thực thi
    pub fn pop_ready_node(&mut self) -> Option<DagNodeDefinition> {
        let node_id = self.ready_queue.pop_front()?;
        self.nodes_state.get(&node_id).map(|s| s.definition.clone())
    }

    /// Đánh dấu một node đã hoàn tất, nạp output vào Blackboard và giảm bậc phụ thuộc của các node con
    pub fn mark_node_completed(
        &mut self,
        node_id: &str,
        outputs: HashMap<String, Value>,
    ) {
        info!(node_id = %node_id, "Node completed execution");
        self.completed_nodes.insert(node_id.to_string());

        // 1. Lưu output vào RAM Blackboard
        for (pin_id, val) in outputs {
            self.blackboard.set_pin_value(node_id, &pin_id, val);
        }

        // 2. Giảm remaining_dependencies cho các node phụ thuộc
        let dependents: Vec<String> = self.nodes_state
            .get(node_id)
            .map(|s| s.dependents.iter().cloned().collect())
            .unwrap_or_default();

        for dep_id in dependents {
            if let Some(dep_state) = self.nodes_state.get_mut(&dep_id) {
                if dep_state.remaining_dependencies > 0 {
                    dep_state.remaining_dependencies -= 1;
                    if dep_state.remaining_dependencies == 0 {
                        debug!(node_id = %dep_id, "Dependencies satisfied. Pushing to ready queue");
                        self.ready_queue.push_back(dep_id);
                    }
                }
            }
        }
    }

    /// Thu thập toàn bộ input cho một node:
    /// Kết hợp giữa cấu hình tĩnh (static inputs) và dữ liệu tra cứu từ Blackboard qua dây nối
    pub fn resolve_node_inputs(&self, node_id: &str) -> HashMap<String, Value> {
        let mut resolved = HashMap::new();

        if let Some(state) = self.nodes_state.get(node_id) {
            // Nạp static inputs
            for (k, v) in &state.definition.inputs {
                resolved.insert(k.clone(), v.clone());
            }

            // Nạp inputs từ Blackboard theo incoming connections.
            // Nếu có >= 2 dây cùng cắm vào 1 target_pin (ví dụ Joint multi-wire fan-in),
            // tự động gom thành mảng phẳng thay vì dây sau ghi đè dây trước.
            let mut wire_buckets: HashMap<String, Vec<Value>> = HashMap::new();
            for (target_pin, source_node, source_pin) in &state.incoming_connections {
                if let Some(val) = self.blackboard.get_pin_value(source_node, source_pin) {
                    wire_buckets
                        .entry(target_pin.clone())
                        .or_default()
                        .push(val);
                }
            }
            for (target_pin, mut vals) in wire_buckets {
                if vals.len() == 1 {
                    resolved.insert(target_pin, vals.remove(0));
                } else {
                    let mut merged = Vec::new();
                    for val in vals {
                        match val {
                            Value::Array(arr) => merged.extend(arr),
                            Value::Null => {}
                            other => merged.push(other),
                        }
                    }
                    resolved.insert(target_pin, Value::Array(merged));
                }
            }
        }

        resolved
    }

    /// Trả về danh sách cạnh nối vào node: `(target_pin, source_node, source_pin)`
    pub fn incoming_connections(&self, node_id: &str) -> Vec<(String, String, String)> {
        self.nodes_state
            .get(node_id)
            .map(|s| s.incoming_connections.clone())
            .unwrap_or_default()
    }

    /// Kiểm tra xem trong ready_queue có node nào đang chờ thực thi không
    pub fn has_ready_nodes(&self) -> bool {
        !self.ready_queue.is_empty()
    }

    /// Kiểm tra xem toàn bộ đồ thị đã hoàn thành chưa
    pub fn is_completed(&self) -> bool {
        self.completed_nodes.len() == self.nodes_state.len()
    }
}

