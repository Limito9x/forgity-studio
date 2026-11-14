use serde_json::Value;
use std::collections::HashMap;
use tracing::debug;

pub enum PureNodeResult {
    /// Trả về tập hợp các pin outputs: HashMap<pin_id, Value>
    Outputs(HashMap<String, Value>),
    /// Bỏ qua vì không phải pure node
    NotPure,
}

/// Xử lý các Pure Nodes trực tiếp trong Rust mà không cần spawn Python hay DCC:
/// - Make <Struct>: gom inputs thành 1 JSON object
/// - Break <Struct>: bung JSON object ra các output fields
/// - Joint / Merge Array: nối các mảng thành 1 mảng phẳng
pub fn execute_pure_node(
    tool_key: &str,
    inputs: &HashMap<String, Value>,
) -> PureNodeResult {
    let lower_tool = tool_key.to_lowercase();

    // 1. Make <Struct>: local:struct:make:<slug> hoặc MakeStruct
    if lower_tool.contains(":struct:make:") || lower_tool == "makestruct" {
        debug!(tool = %tool_key, "Executing pure Make Struct in-memory");
        let mut struct_obj = serde_json::Map::new();
        for (k, v) in inputs {
            struct_obj.insert(k.clone(), v.clone());
        }

        let mut outputs = HashMap::new();
        outputs.insert("struct_out".to_string(), Value::Object(struct_obj.clone()));
        outputs.insert("output".to_string(), Value::Object(struct_obj));
        return PureNodeResult::Outputs(outputs);
    }

    // 2. Break <Struct>: local:struct:break:<slug> hoặc BreakStruct
    if lower_tool.contains(":struct:break:") || lower_tool == "breakstruct" {
        debug!(tool = %tool_key, "Executing pure Break Struct in-memory");
        let mut outputs = HashMap::new();

        // Tìm input struct (chân struct_in hoặc input hoặc target)
        let struct_val = inputs.get("struct_in")
            .or_else(|| inputs.get("input"))
            .or_else(|| inputs.get("target"))
            .or_else(|| inputs.values().next());

        if let Some(Value::Object(map)) = struct_val {
            for (k, v) in map {
                outputs.insert(k.clone(), v.clone());
            }
        }
        return PureNodeResult::Outputs(outputs);
    }

    // 3. Joint / Merge Array: gom nhiều mảng đầu vào thành 1 mảng phẳng duy nhất
    if lower_tool == "joint" || lower_tool == "mergearray" || lower_tool == "concatarray" {
        debug!(tool = %tool_key, "Executing pure Joint / Merge Array in-memory");
        let mut merged_array = Vec::new();

        // Sắp xếp các key để việc gộp mảng có thứ tự tất định (Deterministic)
        let mut sorted_keys: Vec<&String> = inputs.keys().collect();
        sorted_keys.sort();

        for key in sorted_keys {
            if let Some(val) = inputs.get(key) {
                match val {
                    Value::Array(arr) => {
                        merged_array.extend(arr.clone());
                    }
                    Value::Null => {}
                    other => {
                        merged_array.push(other.clone());
                    }
                }
            }
        }

        let mut outputs = HashMap::new();
        outputs.insert("out_array".to_string(), Value::Array(merged_array.clone()));
        outputs.insert("output".to_string(), Value::Array(merged_array));
        return PureNodeResult::Outputs(outputs);
    }

    // 4. Constant Template: local:constant:<key>
    if lower_tool.starts_with("local:constant:") {
        debug!(tool = %tool_key, "Executing pure Constant Template in-memory");
        let mut outputs = HashMap::new();
        for template_key in ["value", "disk_path", "virtual_path"] {
            if let Some(Value::String(tmpl)) = inputs.get(template_key) {
                let mut rendered = tmpl.clone();
                for (k, v) in inputs {
                    if k == "value" || k == "disk_path" || k == "virtual_path" {
                        continue;
                    }
                    let val_str = match v {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => v.to_string(),
                    };
                    rendered = rendered
                        .replace(&format!("${{{}}}", k), &val_str)
                        .replace(&format!("{{{}}}", k), &val_str);
                }
                outputs.insert(template_key.to_string(), Value::String(rendered));
            }
        }
        return PureNodeResult::Outputs(outputs);
    }

    PureNodeResult::NotPure
}

