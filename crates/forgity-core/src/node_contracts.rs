use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;

use super::workspace_db::WorkspaceDb;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawConstantItem {
    #[serde(default)]
    pub id: Option<String>,
    pub key: String,
    #[serde(default)]
    pub value: Value,
    #[serde(default = "default_data_type")]
    pub data_type: String,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default)]
    pub unreal_path: Option<Value>,
    #[serde(default)]
    pub description: Option<String>,
}

fn default_data_type() -> String {
    "String".to_string()
}

fn default_scope() -> String {
    "General".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConstantSpec {
    pub outputs: HashMap<String, Value>,
    #[serde(default)]
    pub template_vars: Vec<String>,
}

#[derive(Debug, Clone)]
struct MaterializedConstant {
    item: RawConstantItem,
    resolved_value: Value,
    resolved_unreal_path: Option<Value>,
    template_vars: Vec<String>,
    outputs: HashMap<String, Value>,
}

fn value_to_inline_str(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

fn resolve_var_string(
    input: &str,
    raw_map: &HashMap<&str, &RawConstantItem>,
    visited: &mut HashSet<String>,
    depth: usize,
) -> String {
    if depth > 10 || !input.contains('$') {
        return input.to_string();
    }

    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'$' {
            if i + 1 < bytes.len() && bytes[i + 1] == b'{' {
                if let Some(rel_end) = input[i + 2..].find('}') {
                    let var_name = &input[i + 2..i + 2 + rel_end];
                    if !var_name.is_empty()
                        && var_name
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
                    {
                        if let Some(replacement) =
                            expand_var_lookup(var_name, raw_map, visited, depth)
                        {
                            out.push_str(&replacement);
                        } else {
                            out.push_str(&input[i..i + 3 + rel_end]);
                        }
                        i += 3 + rel_end;
                        continue;
                    }
                }
            }
        }

        let ch = input[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }

    out
}

fn expand_var_lookup(
    var_name: &str,
    raw_map: &HashMap<&str, &RawConstantItem>,
    visited: &mut HashSet<String>,
    depth: usize,
) -> Option<String> {
    if visited.contains(var_name) {
        return None;
    }
    let target = raw_map.get(var_name)?;
    visited.insert(var_name.to_string());
    let raw_str = value_to_inline_str(&target.value);
    let mut branch_visited = visited.clone();
    Some(resolve_var_string(
        &raw_str,
        raw_map,
        &mut branch_visited,
        depth + 1,
    ))
}

fn resolve_var_value(
    val: &Value,
    self_key: &str,
    raw_map: &HashMap<&str, &RawConstantItem>,
) -> Value {
    match val {
        Value::String(s) => {
            let mut visited = HashSet::new();
            visited.insert(self_key.to_string());
            Value::String(resolve_var_string(s, raw_map, &mut visited, 0))
        }
        Value::Array(arr) => Value::Array(
            arr.iter()
                .map(|item| resolve_var_value(item, self_key, raw_map))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn is_valid_template_var_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn scan_template_vars_in_str(s: &str, known_keys: &HashSet<&str>, out: &mut Vec<String>, seen: &mut HashSet<String>) {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let brace_start = if bytes[i] == b'$' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            Some(i + 2)
        } else if bytes[i] == b'{' {
            Some(i + 1)
        } else {
            None
        };

        if let Some(start) = brace_start {
            if let Some(rel_end) = s[start..].find('}') {
                let name = &s[start..start + rel_end];
                if is_valid_template_var_name(name)
                    && !known_keys.contains(name)
                    && seen.insert(name.to_string())
                {
                    out.push(name.to_string());
                }
                i = start + rel_end + 1;
                continue;
            }
        }
        let ch = s[i..].chars().next().unwrap();
        i += ch.len_utf8();
    }
}

fn collect_template_vars_in_value(
    val: &Value,
    known_keys: &HashSet<&str>,
    out: &mut Vec<String>,
    seen: &mut HashSet<String>,
) {
    match val {
        Value::String(s) => scan_template_vars_in_str(s, known_keys, out, seen),
        Value::Array(arr) => {
            for item in arr {
                collect_template_vars_in_value(item, known_keys, out, seen);
            }
        }
        _ => {}
    }
}

fn has_non_empty_unreal_path(val: &Value) -> bool {
    match val {
        Value::Null => false,
        Value::String(s) => !s.trim().is_empty(),
        Value::Array(_) => true,
        _ => true,
    }
}

fn materialize_constants(items: &[RawConstantItem]) -> Vec<MaterializedConstant> {
    let raw_map: HashMap<&str, &RawConstantItem> =
        items.iter().map(|c| (c.key.as_str(), c)).collect();
    let known_keys: HashSet<&str> = items.iter().map(|c| c.key.as_str()).collect();

    items
        .iter()
        .map(|item| {
            let resolved_value = resolve_var_value(&item.value, &item.key, &raw_map);
            let resolved_unreal_path = item
                .unreal_path
                .as_ref()
                .filter(|v| !v.is_null())
                .map(|v| resolve_var_value(v, &item.key, &raw_map));

            let is_unreal = item.scope.eq_ignore_ascii_case("Unreal");
            let use_dual_pins = is_unreal
                && resolved_unreal_path
                    .as_ref()
                    .map(has_non_empty_unreal_path)
                    .unwrap_or(false);

            let mut outputs = HashMap::new();
            if use_dual_pins {
                outputs.insert("disk_path".to_string(), resolved_value.clone());
                if let Some(ref up) = resolved_unreal_path {
                    outputs.insert("virtual_path".to_string(), up.clone());
                }
            } else {
                outputs.insert("value".to_string(), resolved_value.clone());
            }

            let mut template_vars = Vec::new();
            let mut seen_vars = HashSet::new();
            collect_template_vars_in_value(&resolved_value, &known_keys, &mut template_vars, &mut seen_vars);
            if let Some(ref up) = resolved_unreal_path {
                collect_template_vars_in_value(up, &known_keys, &mut template_vars, &mut seen_vars);
            }

            MaterializedConstant {
                item: item.clone(),
                resolved_value,
                resolved_unreal_path,
                template_vars,
                outputs,
            }
        })
        .collect()
}

fn format_var_label(var_name: &str) -> String {
    var_name
        .split(['_', '-'])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Builds `NodePaletteItemDto[]`-compatible JSON contracts for the Frontend Canvas & Palette.
pub fn build_constant_palette_items(items: &[RawConstantItem]) -> Vec<Value> {
    materialize_constants(items)
        .into_iter()
        .map(|mat| {
            let item = &mat.item;
            let is_array = item.data_type.eq_ignore_ascii_case("Array");
            let cardinality = if is_array { "Array" } else { "Single" };

            let primitive_type = if item.data_type.eq_ignore_ascii_case("Number") {
                "Number"
            } else if item.data_type.eq_ignore_ascii_case("Boolean") {
                "Boolean"
            } else {
                "String"
            };

            let mut output_pins = Vec::new();
            if mat.outputs.contains_key("disk_path") {
                output_pins.push(json!({
                    "id": "disk_path",
                    "label": "Disk Path",
                    "kind": "Data",
                    "primitiveType": "String",
                    "cardinality": cardinality,
                    "isRequired": false,
                    "defaultValue": mat.outputs.get("disk_path").cloned().unwrap_or(Value::Null),
                    "description": "Physical Windows path for DCC / OS tools (Blender, Python)"
                }));
                output_pins.push(json!({
                    "id": "virtual_path",
                    "label": "Virtual Path",
                    "kind": "Data",
                    "primitiveType": "String",
                    "cardinality": cardinality,
                    "isRequired": false,
                    "defaultValue": mat.outputs.get("virtual_path").cloned().unwrap_or(Value::Null),
                    "description": "In-Engine virtual path (/Game/...) for Unreal Engine tools"
                }));
            } else {
                output_pins.push(json!({
                    "id": "value",
                    "label": "Value",
                    "kind": "Data",
                    "primitiveType": primitive_type,
                    "cardinality": cardinality,
                    "isRequired": false,
                    "defaultValue": mat.outputs.get("value").cloned().unwrap_or(Value::Null),
                    "description": item.description.clone().unwrap_or_else(|| format!("Constant value of {}", item.key))
                }));
            }

            let input_pins: Vec<Value> = mat
                .template_vars
                .iter()
                .map(|var_name| {
                    json!({
                        "id": var_name,
                        "label": format_var_label(var_name),
                        "kind": "Data",
                        "primitiveType": "String",
                        "cardinality": "Single",
                        "isRequired": true,
                        "description": format!("Template variable '{{{}}}' for {}", var_name, item.key)
                    })
                })
                .collect();

            let description = item.description.clone().unwrap_or_else(|| {
                format!(
                    "Local Machine Constant: {} ({} - {})",
                    item.key, item.scope, item.data_type
                )
            });

            json!({
                "key": format!("local:constant:{}", item.key),
                "name": item.key,
                "label": format!("Constant: {}", item.key),
                "category": "Constants",
                "source": "Custom",
                "description": description,
                "executor": "pure",
                "inputs": input_pins,
                "outputs": output_pins,
                "isStateless": true,
                "hasDynamicPins": false,
                "capabilities": {
                    "isLocalDraft": true,
                    "isConstantNode": true,
                    "viewVariant": "Constant",
                    "constantKey": item.key,
                    "scope": item.scope,
                    "dataType": item.data_type,
                    "resolvedValue": mat.resolved_value,
                    "resolvedUnrealPath": mat.resolved_unreal_path,
                }
            })
        })
        .collect()
}

/// Compiles `ResolvedConstantSpec` entries for `ExecutionBundle v2`.
pub fn compile_constant_specs(items: &[RawConstantItem]) -> HashMap<String, ResolvedConstantSpec> {
    materialize_constants(items)
        .into_iter()
        .map(|mat| {
            (
                mat.item.key,
                ResolvedConstantSpec {
                    outputs: mat.outputs,
                    template_vars: mat.template_vars,
                },
            )
        })
        .collect()
}

pub fn load_constant_items_from_db(db: &WorkspaceDb) -> Result<Vec<RawConstantItem>, String> {
    let constants_json = db.load_constants_json()?;
    serde_json::from_str::<Vec<RawConstantItem>>(&constants_json)
        .map_err(|e| format!("Failed to parse constants JSON from workspace.db: {}", e))
}

/// Má»Ÿ rá»™ng Ä‘á»‡ quy toÃ n bá»™ `${CONSTANT_NAME}` trong má»™t JSON Value báº¥t ká»³ (chuá»—i, máº£ng, object).
/// CÃº phÃ¡p báº¯t buá»™c pháº£i cÃ³ ngoáº·c nhá»n `${...}` Ä‘á»ƒ trÃ¡nh nháº§m vá»›i `$` láº» hoáº·c chuá»—i tiá»n tá»‡.
pub fn expand_vars_in_json_value(val: &mut Value, raw_items: &[RawConstantItem]) {
    if raw_items.is_empty() {
        return;
    }
    let raw_map: HashMap<&str, &RawConstantItem> = raw_items
        .iter()
        .map(|item| (item.key.as_str(), item))
        .collect();
    expand_vars_value_recursive(val, &raw_map);
}

fn expand_vars_value_recursive(val: &mut Value, raw_map: &HashMap<&str, &RawConstantItem>) {
    match val {
        Value::String(s) if s.contains("${") => {
            let mut visited = HashSet::new();
            *s = resolve_var_string(s, raw_map, &mut visited, 0);
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                expand_vars_value_recursive(item, raw_map);
            }
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                expand_vars_value_recursive(v, raw_map);
            }
        }
        _ => {}
    }
}

/// Má»Ÿ rá»™ng Ä‘á»‡ quy `${CONSTANT_NAME}` trong `nodes[].inputs` cá»§a má»™t DAG Pipeline JSON document.
pub fn expand_vars_in_dag_json(doc: &mut Value, raw_items: &[RawConstantItem]) {
    if raw_items.is_empty() {
        return;
    }
    let raw_map: HashMap<&str, &RawConstantItem> = raw_items
        .iter()
        .map(|item| (item.key.as_str(), item))
        .collect();
    if let Some(nodes) = doc.get_mut("nodes").and_then(|v| v.as_array_mut()) {
        for node in nodes.iter_mut() {
            if let Some(inputs) = node.get_mut("inputs") {
                expand_vars_value_recursive(inputs, &raw_map);
            }
        }
    }
}

/// Built-in System Nodes dÃ¹ng chung cho Engine (khÃ´ng cÃ³ tiá»n tá»‘ `local:`):
/// - `Sequence`: Fan-out cháº¡y nhiá»u nhÃ¡nh song song trÃªn Master Pipeline.
/// - `Joint`: Barrier Ä‘á»£i nhÃ¡nh + gá»™p máº£ng theo tá»«ng cáº·p kÃªnh 1-1 (`in_k` -> `out_k`).
pub fn build_builtin_system_palette_items() -> Vec<Value> {
    vec![
        json!({
            "id": "Sequence",
            "key": "Sequence",
            "label": "Sequence",
            "category": "Flow Control",
            "source": "BuiltIn",
            "executor": "pure",
            "description": "Fan-out execution to multiple parallel branches on a Master Pipeline.",
            "hasDynamicPins": false,
            "isVisibleInPalette": true,
            "inputs": [
                {
                    "id": "exec_in",
                    "label": "Exec",
                    "kind": "Exec",
                    "isRequired": false
                }
            ],
            "outputs": [
                {
                    "id": "then_0",
                    "label": "Then 0",
                    "kind": "Exec",
                    "isRequired": false
                },
                {
                    "id": "then_1",
                    "label": "Then 1",
                    "kind": "Exec",
                    "isRequired": false
                },
                {
                    "id": "then_2",
                    "label": "Then 2",
                    "kind": "Exec",
                    "isRequired": false
                }
            ]
        }),
        json!({
            "id": "Joint",
            "key": "Joint",
            "label": "Joint",
            "category": "Flow Control",
            "source": "BuiltIn",
            "executor": "pure",
            "description": "Buffers incoming items from multiple upstream branches into a single stream and flushes chunks of 'take' items whenever the downstream component is FREE.",
            "hasDynamicPins": false,
            "isVisibleInPalette": true,
            "inputs": [
                {
                    "id": "exec_in",
                    "label": "Exec",
                    "kind": "Exec",
                    "isRequired": false
                },
                {
                    "id": "in",
                    "label": "Items In",
                    "kind": "Data",
                    "primitiveType": "Any",
                    "cardinality": "Array",
                    "isRequired": false
                },
                {
                    "id": "take",
                    "label": "Take Count",
                    "kind": "Data",
                    "primitiveType": "Number",
                    "cardinality": "Single",
                    "defaultValue": 10,
                    "isRequired": false,
                    "description": "Number of items to flush per wave when the downstream component is FREE (0 = take all once upstreams complete)."
                }
            ],
            "outputs": [
                {
                    "id": "exec_out",
                    "label": "Exec",
                    "kind": "Exec",
                    "isRequired": false
                },
                {
                    "id": "out",
                    "label": "Items Out",
                    "kind": "Data",
                    "primitiveType": "Any",
                    "cardinality": "Array",
                    "isRequired": false
                }
            ]
        }),
    ]
}

fn infer_pin_primitive_from_value(val: &Value) -> (&'static str, &'static str) {
    match val {
        Value::Bool(_) => ("Boolean", "Single"),
        Value::Number(_) => ("Number", "Single"),
        Value::Array(_) => ("String", "Array"),
        Value::Object(_) => ("String", "Map"),
        _ => ("String", "Single"),
    }
}

fn is_data_pin(pin: &Value) -> bool {
    let kind = pin
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("Data");
    let id = pin
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    !kind.eq_ignore_ascii_case("Exec") && id != "exec_in" && id != "exec_out"
}

fn is_start_node_json(node: &Value) -> bool {
    let id = node
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let ref_or_tool = node
        .get("refId")
        .or_else(|| node.get("tool"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let kind = node
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    id == "start" || ref_or_tool == "start" || ref_or_tool == "local:start" || kind == "start"
}

fn is_return_node_json(node: &Value) -> bool {
    let id = node
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let ref_or_tool = node
        .get("refId")
        .or_else(|| node.get("tool"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let kind = node
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    id == "return"
        || id == "end"
        || ref_or_tool == "return"
        || ref_or_tool == "end"
        || ref_or_tool == "local:return"
        || ref_or_tool == "local:end"
        || kind == "return"
}

/// BiÃªn dá»‹ch danh sÃ¡ch Component Pipes (`*.component.yaml`) thÃ nh Palette Items (`local:component:<slug>`).
/// Æ¯u tiÃªn trÃ­ch xuáº¥t pin schema tá»« `.forgity/snapshots/<slug>.snap.json` (giá»¯ nguyÃªn `primitiveType`/`cardinality`),
fn infer_component_executor(parsed_yaml: Option<&Value>, parsed_snap: Option<&Value>) -> String {
    if let Some(exec) = parsed_yaml
        .and_then(|v| v.get("executor").and_then(|e| e.as_str()))
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return exec.to_string();
    }

    let find_node_exec = |root: Option<&Value>| -> Option<String> {
        let nodes = root?.get("nodes")?.as_array()?;
        for n in nodes {
            if let Some(exec) = n.get("executor").and_then(|e| e.as_str()).map(str::trim) {
                let lower = exec.to_ascii_lowercase();
                if !exec.is_empty()
                    && !matches!(lower.as_str(), "builtin" | "system" | "pure" | "dotnet")
                {
                    return Some(exec.to_string());
                }
            }
        }
        None
    };

    find_node_exec(parsed_yaml)
        .or_else(|| find_node_exec(parsed_snap))
        .unwrap_or_else(|| "python".to_string())
}

/// fallback vá» `.component.yaml` náº¿u chÆ°a cÃ³ snapshot.
pub fn build_component_palette_items(
    root_path: &Path,
    components: &[(String, String, String)],
) -> Vec<Value> {
    build_component_palette_items_with_snapshots(root_path, components, &HashMap::new())
}

fn build_component_palette_items_with_snapshots(
    root_path: &Path,
    components: &[(String, String, String)],
    snapshots_by_slug: &HashMap<String, Value>,
) -> Vec<Value> {
    let mut items = Vec::new();

    for (slug, full_path, relative_path) in components {
        let yaml_path = {
            let p = Path::new(full_path);
            if p.is_file() {
                p.to_path_buf()
            } else {
                root_path.join(relative_path)
            }
        };
        let yaml_str = std::fs::read_to_string(&yaml_path).unwrap_or_default();
        let parsed_yaml = serde_yaml::from_str::<Value>(&yaml_str).ok();

        let snap_path = root_path
            .join(".forgity")
            .join("snapshots")
            .join(format!("{}.snap.json", slug));
        let parsed_snap = snapshots_by_slug.get(slug).cloned().or_else(|| {
            std::fs::read_to_string(&snap_path)
                .ok()
                .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        });

        let component_name = parsed_snap
            .as_ref()
            .and_then(|v| v.get("name").and_then(|n| n.as_str()))
            .or_else(|| {
                parsed_yaml
                    .as_ref()
                    .and_then(|v| v.get("name").and_then(|n| n.as_str()))
            })
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(slug)
            .to_string();

        let executor = infer_component_executor(parsed_yaml.as_ref(), parsed_snap.as_ref());

        let description = parsed_yaml
            .as_ref()
            .and_then(|v| v.get("description").and_then(|d| d.as_str()))
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                format!(
                    "Single-DCC Component Pipe ({}) executed via local worker.",
                    executor.to_ascii_uppercase()
                )
            });

        let mut input_pins = vec![json!({
            "id": "exec_in",
            "label": "Exec",
            "kind": "Exec",
            "isRequired": false
        })];
        let mut output_pins = vec![json!({
            "id": "exec_out",
            "label": "Exec",
            "kind": "Exec",
            "isRequired": false
        })];

        let mut used_snapshot_pins = false;
        if let Some(parameters) = parsed_snap
            .as_ref()
            .and_then(|snapshot| snapshot.get("parameters").and_then(Value::as_array))
        {
            for parameter in parameters {
                let Some(kind) = parameter.get("kind") else {
                    continue;
                };
                let target_pins = if parameter_kind_matches(kind, "Input", 1) {
                    Some(&mut input_pins)
                } else if parameter_kind_matches(kind, "Output", 2) {
                    Some(&mut output_pins)
                } else {
                    None
                };
                let Some(target_pins) = target_pins else {
                    continue;
                };

                let Some(key) = parameter
                    .get("key")
                    .or_else(|| parameter.get("name"))
                    .or_else(|| parameter.get("id"))
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                else {
                    continue;
                };
                let label = parameter
                    .get("label")
                    .or_else(|| parameter.get("name"))
                    .or_else(|| parameter.get("key"))
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(key);
                let primitive_type = parameter
                    .get("type")
                    .or_else(|| parameter.get("primitiveType"))
                    .filter(|value| !value.is_null())
                    .cloned()
                    .unwrap_or_else(|| json!("String"));
                let cardinality = parameter
                    .get("cardinality")
                    .filter(|value| !value.is_null())
                    .cloned()
                    .unwrap_or_else(|| json!("Single"));
                let mut pin = json!({
                    "id": key,
                    "label": label,
                    "kind": "Data",
                    "primitiveType": primitive_type,
                    "cardinality": cardinality,
                    "isRequired": parameter.get("isRequired").and_then(Value::as_bool).unwrap_or(false)
                });
                if let Some(object) = pin.as_object_mut() {
                    for field in ["structType", "defaultValue", "description"] {
                        if let Some(value) = parameter.get(field) {
                            object.insert(field.to_string(), value.clone());
                        }
                    }
                    if let Some(context_data) = parameter
                        .get("contextData")
                        .filter(|value| !value.is_null())
                    {
                        object.insert("metadata".to_string(), json!(context_data.to_string()));
                    }
                }
                target_pins.push(pin);
            }
            used_snapshot_pins = true;
        } else if let Some(snap_nodes) = parsed_snap
            .as_ref()
            .and_then(|v| v.get("nodes").and_then(|n| n.as_array()))
        {
            if let Some(start_node) = snap_nodes.iter().find(|n| is_start_node_json(n)) {
                if let Some(start_outputs) = start_node.get("outputs").and_then(|v| v.as_array()) {
                    for pin in start_outputs.iter().filter(|p| is_data_pin(p)) {
                        input_pins.push(pin.clone());
                    }
                }
                used_snapshot_pins = true;
            }
            if let Some(return_node) = snap_nodes.iter().find(|n| is_return_node_json(n)) {
                if let Some(ret_inputs) = return_node.get("inputs").and_then(|v| v.as_array()) {
                    for pin in ret_inputs.iter().filter(|p| is_data_pin(p)) {
                        output_pins.push(pin.clone());
                    }
                }
                used_snapshot_pins = true;
            }
        }

        if !used_snapshot_pins {
            if let Some(yaml_nodes) = parsed_yaml
                .as_ref()
                .and_then(|v| v.get("nodes").and_then(|n| n.as_array()))
            {
                if let Some(start_node) = yaml_nodes.iter().find(|n| is_start_node_json(n)) {
                    if let Some(start_inputs) = start_node.get("inputs").and_then(|v| v.as_object()) {
                        for (k, val) in start_inputs {
                            let (prim, card) = infer_pin_primitive_from_value(val);
                            input_pins.push(json!({
                                "id": k,
                                "label": k,
                                "kind": "Data",
                                "primitiveType": prim,
                                "cardinality": card,
                                "isRequired": false
                            }));
                        }
                    }
                }
                if let Some(return_node) = yaml_nodes.iter().find(|n| is_return_node_json(n)) {
                    if let Some(ret_inputs) = return_node.get("inputs").and_then(|v| v.as_object()) {
                        for (k, val) in ret_inputs {
                            let (prim, card) = infer_pin_primitive_from_value(val);
                            output_pins.push(json!({
                                "id": k,
                                "label": k,
                                "kind": "Data",
                                "primitiveType": prim,
                                "cardinality": card,
                                "isRequired": false
                            }));
                        }
                    }
                }
            }
        }

        let comp_key = format!("local:component:{}", slug);
        items.push(json!({
            "id": comp_key,
            "key": comp_key,
            "label": component_name,
            "category": "Component Pipes",
            "source": "SubPipeline",
            "executor": executor,
            "inputs": input_pins,
            "outputs": output_pins,
            "description": description,
            "hasDynamicPins": false,
            "isVisibleInPalette": true
        }));
    }

    items
}

fn parameter_kind_matches(value: &Value, name: &str, numeric_value: i64) -> bool {
    value
        .as_str()
        .map(|kind| kind.eq_ignore_ascii_case(name))
        .unwrap_or_else(|| value.as_i64() == Some(numeric_value))
}

pub fn load_constant_palette(root_path: String) -> Result<Vec<Value>, String> {
    let root = Path::new(&root_path);
    let db = WorkspaceDb::open(root)?;
    let items = load_constant_items_from_db(&db)?;
    Ok(build_constant_palette_items(&items))
}

pub fn discover_component_pipelines(
    root: &Path,
    db: Option<&WorkspaceDb>,
) -> Vec<(String, String, String)> {
    let mut components_by_slug: HashMap<String, (String, String, String)> = HashMap::new();

    // 1. Scan disk `.component.yaml` files directly so newly added or existing files are always discovered
    let pipelines_dir = std::fs::read_to_string(root.join(".forgity").join("workspace.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("pipelinesDir").and_then(|d| d.as_str()).map(|s| s.to_string()))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "pipelines".to_string());

    let pipelines_folder = root.join(&pipelines_dir);
    let scanned = super::pipeline::scan_local_pipeline_drafts(
        pipelines_folder.to_string_lossy().to_string(),
    );
    for item in scanned {
        if item.pipeline_kind.eq_ignore_ascii_case("component") {
            let slug = item
                .file_name
                .trim_end_matches(".component.yaml")
                .trim_end_matches(".component.yml")
                .trim_end_matches(".pipeline.yaml")
                .trim_end_matches(".pipeline.yml")
                .trim_end_matches(".yaml")
                .trim_end_matches(".yml")
                .to_string();
            if !slug.is_empty() {
                let rel = format!(
                    "{}/{}",
                    pipelines_dir.trim_end_matches('/'),
                    item.relative_path.trim_start_matches('/')
                );
                components_by_slug.insert(slug.clone(), (slug, item.full_path, rel));
            }
        }
    }

    // 2. Merge any component pipelines recorded in workspace.db
    if let Some(db) = db {
        if let Ok(db_comps) = db.load_component_pipelines() {
            for (slug, full_path, relative_path) in db_comps {
                components_by_slug
                    .entry(slug.clone())
                    .or_insert((slug, full_path, relative_path));
            }
        }
    }

    let mut components: Vec<(String, String, String)> = components_by_slug.into_values().collect();
    components.sort_by(|a, b| a.0.cmp(&b.0));
    components
}

pub fn load_workspace_node_contracts(root_path: String) -> Result<Vec<Value>, String> {
    let root = Path::new(&root_path);
    let db = WorkspaceDb::open(root)?;

    let mut palette = build_builtin_system_palette_items();

    let const_items = load_constant_items_from_db(&db)?;
    palette.extend(build_constant_palette_items(&const_items));

    let components = discover_component_pipelines(root, Some(&db));
    let mut snapshots_by_slug = HashMap::new();
    for (slug, _, _) in &components {
        if let Some(snapshot_json) = db.load_pipeline_snapshot(slug)? {
            let snapshot = serde_json::from_str(&snapshot_json).map_err(|error| {
                format!("Component snapshot '{}' is invalid JSON: {}", slug, error)
            })?;
            snapshots_by_slug.insert(slug.clone(), snapshot);
        }
    }
    palette.extend(build_component_palette_items_with_snapshots(
        root,
        &components,
        &snapshots_by_slug,
    ));

    Ok(palette)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_materialize_constants_expands_vars_and_extracts_template_vars() {
        let items = vec![
            RawConstantItem {
                id: Some("1".into()),
                key: "BASE_DIR".into(),
                value: json!("D:/Projects"),
                data_type: "String".into(),
                scope: "General".into(),
                unreal_path: None,
                description: None,
            },
            RawConstantItem {
                id: Some("2".into()),
                key: "CHAR_DIR".into(),
                value: json!("${BASE_DIR}/Chars/{character_name}"),
                data_type: "String".into(),
                scope: "General".into(),
                unreal_path: None,
                description: None,
            },
        ];

        let specs = compile_constant_specs(&items);
        let char_spec = specs.get("CHAR_DIR").unwrap();
        assert_eq!(
            char_spec.outputs.get("value"),
            Some(&json!("D:/Projects/Chars/{character_name}"))
        );
        assert_eq!(char_spec.template_vars, vec!["character_name".to_string()]);
    }

    #[test]
    fn test_materialize_constants_cycle_guard() {
        let items = vec![
            RawConstantItem {
                id: None,
                key: "A".into(),
                value: json!("${B}/x"),
                data_type: "String".into(),
                scope: "General".into(),
                unreal_path: None,
                description: None,
            },
            RawConstantItem {
                id: None,
                key: "B".into(),
                value: json!("${A}/y"),
                data_type: "String".into(),
                scope: "General".into(),
                unreal_path: None,
                description: None,
            },
        ];

        let specs = compile_constant_specs(&items);
        let a_val = specs["A"].outputs["value"].as_str().unwrap();
        assert!(a_val.contains("${A}"));
    }

    #[test]
    fn test_unreal_array_constant_emits_dual_pins_in_palette_and_bundle() {
        let items = vec![RawConstantItem {
            id: Some("c1".into()),
            key: "PDA_PATHS".into(),
            value: json!(["/Game/A", "/Game/B"]),
            data_type: "Array".into(),
            scope: "Unreal".into(),
            unreal_path: Some(json!(["/Game/A", "/Game/B"])),
            description: None,
        }];

        let specs = compile_constant_specs(&items);
        let spec = specs.get("PDA_PATHS").unwrap();
        assert_eq!(spec.outputs["disk_path"], json!(["/Game/A", "/Game/B"]));
        assert_eq!(spec.outputs["virtual_path"], json!(["/Game/A", "/Game/B"]));
        assert!(spec.template_vars.is_empty());

        let palette = build_constant_palette_items(&items);
        assert_eq!(palette[0]["key"], "local:constant:PDA_PATHS");
        assert_eq!(palette[0]["outputs"][0]["id"], "disk_path");
        assert_eq!(palette[0]["outputs"][0]["cardinality"], "Array");
        assert_eq!(palette[0]["outputs"][1]["id"], "virtual_path");
        assert_eq!(palette[0]["outputs"][1]["defaultValue"], json!(["/Game/A", "/Game/B"]));
    }

    #[test]
    fn test_expand_vars_in_dag_json_only_expands_braced_syntax() {
        let items = vec![
            RawConstantItem {
                id: None,
                key: "BASE_DIR".into(),
                value: json!("D:/Games"),
                data_type: "String".into(),
                scope: "General".into(),
                unreal_path: None,
                description: None,
            },
            RawConstantItem {
                id: None,
                key: "CHAR_DIR".into(),
                value: json!("${BASE_DIR}/Chars"),
                data_type: "String".into(),
                scope: "General".into(),
                unreal_path: None,
                description: None,
            },
        ];

        let mut doc = json!({
            "name": "test_dag",
            "nodes": [
                {
                    "id": "n1",
                    "tool": "local:script:blender/export",
                    "inputs": {
                        "path": "${CHAR_DIR}/{character_name}/Eva.fbx",
                        "bare_kept": "$BASE_DIR/untouched",
                        "price_kept": "$100",
                        "missing_kept": "${UNKNOWN}/x",
                        "arr": ["${BASE_DIR}/a", "${CHAR_DIR}/b"]
                    }
                }
            ]
        });

        expand_vars_in_dag_json(&mut doc, &items);

        let inputs = &doc["nodes"][0]["inputs"];
        assert_eq!(inputs["path"], json!("D:/Games/Chars/{character_name}/Eva.fbx"));
        assert_eq!(inputs["bare_kept"], json!("$BASE_DIR/untouched"));
        assert_eq!(inputs["price_kept"], json!("$100"));
        assert_eq!(inputs["missing_kept"], json!("${UNKNOWN}/x"));
        assert_eq!(inputs["arr"], json!(["D:/Games/a", "D:/Games/Chars/b"]));
    }

    #[test]
    fn test_builtin_system_palette_contracts() {
        let builtins = build_builtin_system_palette_items();
        assert_eq!(builtins.len(), 2);
        assert_eq!(builtins[0]["key"], "Sequence");
        assert_eq!(builtins[0]["source"], "BuiltIn");
        assert_eq!(builtins[1]["key"], "Joint");
        assert_eq!(builtins[1]["hasDynamicPins"], false);
        assert_eq!(builtins[1]["inputs"][1]["id"], "in");
        assert_eq!(builtins[1]["inputs"][2]["id"], "take");
        assert_eq!(builtins[1]["inputs"][2]["defaultValue"], 10);
        assert_eq!(builtins[1]["outputs"][1]["id"], "out");
    }

    #[test]
    fn test_component_palette_prefers_snapshot_pins_and_falls_back_to_yaml() {
        let root = std::env::temp_dir().join(format!("forgity_comp_palette_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let pipes_dir = root.join("pipelines").join("components");
        let snaps_dir = root.join(".forgity").join("snapshots");
        std::fs::create_dir_all(&pipes_dir).unwrap();
        std::fs::create_dir_all(&snaps_dir).unwrap();

        let bake_yaml = pipes_dir.join("bake_body.component.yaml");
        std::fs::write(
            &bake_yaml,
            "name: \"Bake Body\"\nkind: \"component\"\nexecutor: \"blender\"\nnodes:\n  - id: start\n    tool: Start\n  - id: return\n    tool: Return\n",
        )
        .unwrap();
        std::fs::write(
            snaps_dir.join("bake_body.snap.json"),
            json!({
                "name": "Bake Body",
                "nodes": [
                    {
                        "id": "start",
                        "kind": "Start",
                        "outputs": [
                            { "id": "exec_out", "kind": "Exec" },
                            { "id": "fbx_file", "label": "FBX File", "kind": "Data", "primitiveType": "File", "cardinality": "Single" }
                        ]
                    },
                    {
                        "id": "return",
                        "kind": "Return",
                        "inputs": [
                            { "id": "exec_in", "kind": "Exec" },
                            { "id": "textures", "label": "Textures", "kind": "Data", "primitiveType": "File", "cardinality": "Array" }
                        ]
                    }
                ]
            })
            .to_string(),
        )
        .unwrap();

        let fallback_yaml = pipes_dir.join("fallback_comp.component.yaml");
        std::fs::write(
            &fallback_yaml,
            "name: \"Fallback Comp\"\nkind: \"component\"\nexecutor: \"unreal\"\nnodes:\n  - id: start\n    tool: Start\n    inputs:\n      count: 3\n  - id: return\n    tool: Return\n    inputs:\n      ok: true\n",
        )
        .unwrap();

        let components = vec![
            (
                "bake_body".to_string(),
                bake_yaml.to_string_lossy().to_string(),
                "pipelines/components/bake_body.component.yaml".to_string(),
            ),
            (
                "fallback_comp".to_string(),
                fallback_yaml.to_string_lossy().to_string(),
                "pipelines/components/fallback_comp.component.yaml".to_string(),
            ),
        ];

        let items = build_component_palette_items(&root, &components);
        assert_eq!(items.len(), 2);

        assert_eq!(items[0]["key"], "local:component:bake_body");
        assert_eq!(items[0]["executor"], "blender");
        assert_eq!(items[0]["inputs"][0]["id"], "exec_in");
        assert_eq!(items[0]["inputs"][1]["id"], "fbx_file");
        assert_eq!(items[0]["inputs"][1]["primitiveType"], "File");
        assert_eq!(items[0]["outputs"][1]["id"], "textures");
        assert_eq!(items[0]["outputs"][1]["cardinality"], "Array");

        assert_eq!(items[1]["key"], "local:component:fallback_comp");
        assert_eq!(items[1]["inputs"][1]["id"], "count");
        assert_eq!(items[1]["inputs"][1]["primitiveType"], "Number");
        assert_eq!(items[1]["outputs"][1]["id"], "ok");
        assert_eq!(items[1]["outputs"][1]["primitiveType"], "Boolean");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_component_palette_regenerates_and_clears_pins_from_parameter_contract() {
        let root = std::env::temp_dir().join(format!("forgity_comp_params_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("pipelines").join("components")).unwrap();

        let components = vec![
            (
                "updated".to_string(),
                root.join("pipelines/components/updated.component.yaml")
                    .to_string_lossy()
                    .to_string(),
                "pipelines/components/updated.component.yaml".to_string(),
            ),
            (
                "cleared".to_string(),
                root.join("pipelines/components/cleared.component.yaml")
                    .to_string_lossy()
                    .to_string(),
                "pipelines/components/cleared.component.yaml".to_string(),
            ),
        ];
        let mut snapshots = HashMap::new();
        snapshots.insert(
            "updated".to_string(),
            json!({
                "parameters": [
                    {
                        "id": "guid-input",
                        "key": "input_path",
                        "label": "Input Path",
                        "kind": "Input",
                        "type": "Asset",
                        "contextData": { "type": "path", "pathKind": "file" }
                    },
                    {
                        "id": "guid-output",
                        "key": "textures",
                        "label": "Textures",
                        "kind": "Output",
                        "type": "Asset",
                        "cardinality": "Array"
                    }
                ],
                "nodes": [
                    {
                        "id": "start",
                        "kind": "Start",
                        "outputs": [{ "id": "stale", "kind": "Data" }]
                    },
                    {
                        "id": "return",
                        "kind": "Return",
                        "inputs": [{ "id": "stale", "kind": "Data" }]
                    }
                ]
            }),
        );
        snapshots.insert(
            "cleared".to_string(),
            json!({
                "parameters": [],
                "nodes": [
                    {
                        "id": "start",
                        "kind": "Start",
                        "outputs": [{ "id": "stale", "kind": "Data" }]
                    },
                    {
                        "id": "return",
                        "kind": "Return",
                        "inputs": [{ "id": "stale", "kind": "Data" }]
                    }
                ]
            }),
        );

        let items = build_component_palette_items_with_snapshots(&root, &components, &snapshots);
        assert_eq!(items[0]["inputs"][1]["id"], "input_path");
        assert_eq!(items[0]["inputs"][1]["label"], "Input Path");
        assert_eq!(items[0]["inputs"][1]["primitiveType"], "Asset");
        let metadata: Value = serde_json::from_str(
            items[0]["inputs"][1]["metadata"]
                .as_str()
                .expect("file pin metadata"),
        )
        .expect("valid file pin metadata");
        assert_eq!(metadata, json!({ "type": "path", "pathKind": "file" }));
        assert_eq!(items[0]["outputs"][1]["id"], "textures");
        assert_eq!(items[0]["outputs"][1]["cardinality"], "Array");
        assert_eq!(items[1]["inputs"].as_array().unwrap().len(), 1);
        assert_eq!(items[1]["outputs"].as_array().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&root);
    }
}
