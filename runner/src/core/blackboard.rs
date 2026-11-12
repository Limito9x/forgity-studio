use std::path::Path;
use dashmap::DashMap;
use serde_json::Value;
use tracing::debug;

/// In-Memory Blackboard giữ toàn bộ giá trị chân pin trong RAM lúc đang chạy.
/// Key: (node_id, pin_id)
/// Value: serde_json::Value
#[derive(Debug, Default)]
pub struct Blackboard {
    pins: DashMap<(String, String), Value>,
}

impl Blackboard {
    pub fn new() -> Self {
        Self {
            pins: DashMap::new(),
        }
    }

    /// Lưu giá trị chân pin Output của một Node vào RAM (0.001ms)
    pub fn set_pin_value(&self, node_id: &str, pin_id: &str, value: Value) {
        debug!(node_id = %node_id, pin_id = %pin_id, "Blackboard set pin value");
        self.pins.insert((node_id.to_string(), pin_id.to_string()), value);
    }

    /// Tra cứu giá trị chân pin từ RAM
    pub fn get_pin_value(&self, node_id: &str, pin_id: &str) -> Option<Value> {
        self.pins.get(&(node_id.to_string(), pin_id.to_string())).map(|v| v.clone())
    }

    /// Lấy toàn bộ giá trị của một node (Map các pin_id -> Value)
    pub fn get_node_outputs(&self, node_id: &str) -> serde_json::Map<String, Value> {
        let mut map = serde_json::Map::new();
        for item in self.pins.iter() {
            if item.key().0 == node_id {
                map.insert(item.key().1.clone(), item.value().clone());
            }
        }
        map
    }

    /// Xuất toàn bộ trạng thái Blackboard ra JSON Map
    pub fn to_json_snapshot(&self) -> Value {
        let mut root = serde_json::Map::new();
        for item in self.pins.iter() {
            let (ref node_id, ref pin_id) = item.key();
            let node_entry = root.entry(node_id.clone()).or_insert_with(|| Value::Object(serde_json::Map::new()));
            if let Value::Object(ref mut map) = node_entry {
                map.insert(pin_id.clone(), item.value().clone());
            }
        }
        Value::Object(root)
    }

    /// Flush nhẹ trạng thái ra file checkpoint trên ổ đĩa
    pub fn checkpoint_to_disk(&self, checkpoint_path: &Path) -> Result<(), String> {
        if let Some(parent) = checkpoint_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let snapshot = self.to_json_snapshot();
        let json_str = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| format!("Failed to serialize blackboard snapshot: {}", e))?;
        std::fs::write(checkpoint_path, json_str)
            .map_err(|e| format!("Failed to write checkpoint file: {}", e))?;
        Ok(())
    }
}

