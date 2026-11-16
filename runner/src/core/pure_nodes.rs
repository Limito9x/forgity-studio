use serde_json::Value;
use std::collections::HashMap;
use tracing::debug;

use super::traits::ResolvedConstantSpec;

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
            if k == "exec_in" || k == "exec_out" {
                continue;
            }
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

    // 3. Joint / Merge Array: gom mảng từ chân `in` (hoặc `in_k` tương thích ngược) ra chân `out`
    if lower_tool == "joint"
        || lower_tool == "local:joint"
        || lower_tool == "merge_array"
        || lower_tool == "mergearray"
        || lower_tool == "concatarray"
    {
        debug!(tool = %tool_key, "Executing pure Joint / Merge Array in-memory");
        let mut merged_array = Vec::new();
        let mut outputs = HashMap::new();

        // Sắp xếp các key để việc gộp mảng có thứ tự tất định (Deterministic)
        let mut sorted_keys: Vec<&String> = inputs.keys().collect();
        sorted_keys.sort();

        for key in sorted_keys {
            if key == "exec_in" || key == "exec_out" || key == "take" {
                continue;
            }
            if let Some(val) = inputs.get(key) {
                let mut channel_items = Vec::new();
                match val {
                    Value::Array(arr) => {
                        channel_items.extend(arr.clone());
                    }
                    Value::Null => {}
                    other => {
                        channel_items.push(other.clone());
                    }
                }
                merged_array.extend(channel_items.clone());

                let lower_key = key.to_ascii_lowercase();
                let out_key = if lower_key == "in" {
                    "out".to_string()
                } else if let Some(suffix) = lower_key.strip_prefix("in_") {
                    format!("out_{}", suffix)
                } else {
                    format!("out_{}", key)
                };
                outputs.insert(out_key, Value::Array(channel_items));
            }
        }

        outputs.insert("out".to_string(), Value::Array(merged_array.clone()));
        outputs
            .entry("out_1".to_string())
            .or_insert_with(|| Value::Array(merged_array.clone()));
        outputs.insert("out_array".to_string(), Value::Array(merged_array.clone()));
        outputs.insert("output".to_string(), Value::Array(merged_array));
        return PureNodeResult::Outputs(outputs);
    }

    // 4. Constant Template: local:constant:<key>
    if lower_tool.starts_with("local:constant:") {
        debug!(tool = %tool_key, "Executing pure Constant Template in-memory");
        let mut outputs = HashMap::new();
        for template_key in ["value", "disk_path", "virtual_path"] {
            if let Some(raw_val) = inputs.get(template_key) {
                if !raw_val.is_null() {
                    outputs.insert(
                        template_key.to_string(),
                        render_constant_value(raw_val, inputs),
                    );
                }
            }
        }
        return PureNodeResult::Outputs(outputs);
    }

    PureNodeResult::NotPure
}

/// Evaluates a `local:constant:<key>` node strictly from its materialized `ResolvedConstantSpec`
/// without guessing pin names. Fails fast if any required template variable is missing.
pub fn execute_constant_node(
    tool_key: &str,
    spec: &ResolvedConstantSpec,
    inputs: &HashMap<String, Value>,
) -> anyhow::Result<HashMap<String, Value>> {
    for var_name in &spec.template_vars {
        let missing = inputs
            .get(var_name)
            .map(|v| v.is_null())
            .unwrap_or(true);
        if missing {
            anyhow::bail!(
                "Constant '{}' is missing required template variable '{}'",
                tool_key,
                var_name
            );
        }
    }

    let mut outputs = HashMap::with_capacity(spec.outputs.len());
    for (pin_id, raw_val) in &spec.outputs {
        if !raw_val.is_null() {
            outputs.insert(pin_id.clone(), render_constant_value(raw_val, inputs));
        }
    }
    Ok(outputs)
}

fn render_constant_value(val: &Value, inputs: &HashMap<String, Value>) -> Value {
    match val {
        Value::String(tmpl) => {
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
            Value::String(rendered)
        }
        Value::Array(arr) => {
            Value::Array(arr.iter().map(|item| render_constant_value(item, inputs)).collect())
        }
        other => other.clone(),
    }
}

