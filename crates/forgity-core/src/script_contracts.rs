use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const CONTRACTS_YAML_FILE: &str = "contracts.yaml";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PinOverride {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primitive_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub struct_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOverride {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub inputs: HashMap<String, PinOverride>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub outputs: HashMap<String, PinOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceContractsFile {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub constants: Vec<serde_json::Value>,
    #[serde(default)]
    pub structs: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub script_overrides: HashMap<String, ScriptOverride>,
}

fn default_version() -> u32 {
    1
}

impl Default for WorkspaceContractsFile {
    fn default() -> Self {
        Self {
            version: 1,
            constants: Vec::new(),
            structs: Vec::new(),
            script_overrides: HashMap::new(),
        }
    }
}

pub fn contracts_path(root_path: &Path) -> PathBuf {
    root_path.join(CONTRACTS_YAML_FILE)
}

pub fn load_contracts_file(root_path: &Path) -> WorkspaceContractsFile {
    let path = contracts_path(root_path);
    if !path.is_file() {
        return WorkspaceContractsFile::default();
    }
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return WorkspaceContractsFile::default(),
    };
    serde_yaml::from_str::<WorkspaceContractsFile>(&content).unwrap_or_default()
}

pub fn save_contracts_file(root_path: &Path, contracts: &WorkspaceContractsFile) -> Result<(), String> {
    let path = contracts_path(root_path);
    let yaml = serde_yaml::to_string(contracts)
        .map_err(|e| format!("Failed to serialize contracts.yaml: {}", e))?;
    std::fs::write(&path, yaml)
        .map_err(|e| format!("Failed to write contracts.yaml: {}", e))?;
    Ok(())
}

/// Applies `script_overrides` from `contracts.yaml` onto a JSON-serialized analyzed script node
/// in a single pass before persisting into SQLite.
pub fn apply_script_override_to_json(node: &mut serde_json::Value, override_cfg: &ScriptOverride) {
    if let Some(obj) = node.as_object_mut() {
        if let Some(ref label) = override_cfg.label {
            obj.insert("suggestedLabel".to_string(), serde_json::json!(label));
        }
        if let Some(ref desc) = override_cfg.description {
            obj.insert("description".to_string(), serde_json::json!(desc));
        }
        if let Some(ref exec) = override_cfg.executor {
            obj.insert("executor".to_string(), serde_json::json!(exec));
        }

        if !override_cfg.inputs.is_empty() {
            if let Some(inputs) = obj.get_mut("inputs").and_then(|v| v.as_array_mut()) {
                apply_pin_overrides(inputs, &override_cfg.inputs);
            }
        }
        if !override_cfg.outputs.is_empty() {
            if let Some(outputs) = obj.get_mut("outputs").and_then(|v| v.as_array_mut()) {
                apply_pin_overrides(outputs, &override_cfg.outputs);
            }
        }
    }
}

fn apply_pin_overrides(pins: &mut [serde_json::Value], overrides: &HashMap<String, PinOverride>) {
    for pin in pins.iter_mut() {
        let pin_id = match pin.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let Some(ov) = overrides.get(&pin_id) else {
            continue;
        };
        if let Some(obj) = pin.as_object_mut() {
            if let Some(ref l) = ov.label {
                obj.insert("label".to_string(), serde_json::json!(l));
            }
            if let Some(ref pt) = ov.primitive_type {
                obj.insert("primitiveType".to_string(), serde_json::json!(pt));
            }
            if let Some(ref st) = ov.struct_type {
                obj.insert("structType".to_string(), serde_json::json!(st));
            }
            if let Some(ref dv) = ov.default_value {
                obj.insert("defaultValue".to_string(), dv.clone());
            }
            if let Some(ref d) = ov.description {
                obj.insert("description".to_string(), serde_json::json!(d));
            }
            if let Some(ref m) = ov.metadata {
                obj.insert("metadata".to_string(), serde_json::json!(m));
            } else if let Some(ref c) = ov.constant {
                obj.insert(
                    "metadata".to_string(),
                    serde_json::json!(serde_json::json!({ "type": "constant", "constantKey": c }).to_string()),
                );
            }
        }
    }
}

pub fn save_script_override(
    root_path: String,
    script_key: String,
    override_json: String,
) -> Result<String, String> {
    let root = Path::new(&root_path);
    let override_cfg: ScriptOverride = serde_json::from_str(&override_json)
        .map_err(|e| format!("Invalid script override JSON: {}", e))?;

    let mut contracts = load_contracts_file(root);
    let is_empty = override_cfg.label.is_none()
        && override_cfg.description.is_none()
        && override_cfg.executor.is_none()
        && override_cfg.inputs.is_empty()
        && override_cfg.outputs.is_empty();

    if is_empty {
        contracts.script_overrides.remove(&script_key);
    } else {
        contracts
            .script_overrides
            .insert(script_key.clone(), override_cfg.clone());
    }
    save_contracts_file(root, &contracts)?;

    // Also update the node in workspace.db immediately if present
    let db = super::workspace_db::WorkspaceDb::open(root)?;
    let palette_str = db.load_palette_json()?;
    let mut palette_map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&palette_str).unwrap_or_default();

    let mut updated_node_json = String::from("{}");
    if let Some(node) = palette_map.get_mut(&script_key) {
        if !is_empty {
            apply_script_override_to_json(node, &override_cfg);
        }
        updated_node_json = serde_json::to_string(node).unwrap_or_else(|_| "{}".to_string());
        let new_palette_str = serde_json::to_string(&palette_map)
            .map_err(|e| format!("Failed to serialize palette: {}", e))?;
        db.save_palette_json(&new_palette_str)?;
    }

    Ok(updated_node_json)
}

pub fn clear_script_override(
    root_path: String,
    script_key: String,
    pin_id: Option<String>,
) -> Result<(), String> {
    let root = Path::new(&root_path);
    let mut contracts = load_contracts_file(root);

    if let Some(pid) = pin_id {
        if let Some(ov) = contracts.script_overrides.get_mut(&script_key) {
            ov.inputs.remove(&pid);
            ov.outputs.remove(&pid);
            let is_empty = ov.label.is_none()
                && ov.description.is_none()
                && ov.executor.is_none()
                && ov.inputs.is_empty()
                && ov.outputs.is_empty();
            if is_empty {
                contracts.script_overrides.remove(&script_key);
            }
        }
    } else {
        contracts.script_overrides.remove(&script_key);
    }

    save_contracts_file(root, &contracts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_script_override_merges_pins_and_label() {
        let mut node = serde_json::json!({
            "key": "blender/export_fbx",
            "suggestedLabel": "Export Fbx",
            "inputs": [
                { "id": "export_mode", "label": "Export Mode", "primitiveType": "String" }
            ],
            "outputs": []
        });

        let mut inputs = HashMap::new();
        inputs.insert(
            "export_mode".to_string(),
            PinOverride {
                default_value: Some(serde_json::json!("Batch")),
                ..Default::default()
            },
        );

        let ov = ScriptOverride {
            label: Some("Blender FBX Exporter".to_string()),
            inputs,
            ..Default::default()
        };

        apply_script_override_to_json(&mut node, &ov);

        assert_eq!(node["suggestedLabel"], "Blender FBX Exporter");
        assert_eq!(node["inputs"][0]["defaultValue"], "Batch");
    }

    #[test]
    fn test_apply_script_override_changes_primitive_type_to_file() {
        let mut node = serde_json::json!({
            "key": "python/process",
            "suggestedLabel": "Process",
            "inputs": [
                { "id": "input_path", "label": "Input Path", "primitiveType": "String" }
            ],
            "outputs": []
        });

        let mut inputs = HashMap::new();
        inputs.insert(
            "input_path".to_string(),
            PinOverride {
                primitive_type: Some("File".to_string()),
                ..Default::default()
            },
        );

        let ov = ScriptOverride {
            inputs,
            ..Default::default()
        };

        apply_script_override_to_json(&mut node, &ov);

        assert_eq!(node["inputs"][0]["primitiveType"], "File");
    }
}

