use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::node_contracts;
use crate::workspace_db::WorkspaceDb;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedScriptBundleDto {
    pub key: String,
    pub executor: String,
    pub full_path: String,
    pub requirements: Vec<String>,
    pub default_inputs: HashMap<String, Value>,
}

/// Đọc `.forgity/workspace.db` (nếu có) và đóng gói thành `ExecutionBundle` v2 JSON DTO.
pub fn build_execution_bundle(
    root_path: &Path,
    run_id: &str,
    pipeline_yaml_content: &str,
    pipeline_kind: &str,
    mut runtime_inputs: HashMap<String, Value>,
) -> Result<Value, String> {
    let mut root_pipeline: Value = serde_yaml::from_str(pipeline_yaml_content)
        .map_err(|e| format!("Failed to parse pipeline YAML: {}", e))?;

    let mut scripts_map: HashMap<String, ResolvedScriptBundleDto> = HashMap::new();
    let mut components_map: HashMap<String, Value> = HashMap::new();
    let mut constants_map: HashMap<String, node_contracts::ResolvedConstantSpec> = HashMap::new();
    let mut raw_constants: Vec<node_contracts::RawConstantItem> = Vec::new();

    let db_file = root_path.join(".forgity").join("workspace.db");
    let db_opt = if db_file.is_file() {
        WorkspaceDb::open(root_path).ok()
    } else {
        None
    };

    if let Some(ref db) = db_opt {
        if let Ok(palette_json) = db.load_palette_json() {
            if let Ok(parsed_palette) = serde_json::from_str::<Value>(&palette_json) {
                let entries: Vec<(Option<String>, Value)> = match parsed_palette {
                    Value::Object(map) => map.into_iter().map(|(k, v)| (Some(k), v)).collect(),
                    Value::Array(arr) => arr.into_iter().map(|v| (None, v)).collect(),
                    _ => Vec::new(),
                };

                for (map_key, item) in entries {
                    let key = item
                        .get("key")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .or(map_key)
                        .unwrap_or_default();
                    if key.is_empty() {
                        continue;
                    }
                    let full_path = item
                        .get("fullPath")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let executor = item
                        .get("executor")
                        .and_then(|v| v.as_str())
                        .unwrap_or("python")
                        .to_string();

                    let mut default_inputs = HashMap::new();
                    if let Some(inputs) = item.get("inputs").and_then(|v| v.as_array()) {
                        for pin in inputs {
                            if let (Some(pid), Some(def_val)) = (
                                pin.get("id").and_then(|v| v.as_str()),
                                pin.get("defaultValue"),
                            ) {
                                if !def_val.is_null() {
                                    default_inputs.insert(pid.to_string(), def_val.clone());
                                }
                            }
                        }
                    }

                    let mut requirements = Vec::new();
                    if let Some(deps) = item.get("dependencies").and_then(|v| v.as_array()) {
                        for dep in deps {
                            let pkg = dep
                                .get("packageName")
                                .and_then(|v| v.as_str())
                                .filter(|s| !s.is_empty())
                                .or_else(|| {
                                    dep.get("module")
                                        .and_then(|v| v.as_str())
                                        .filter(|s| !s.is_empty())
                                });
                            if let Some(p) = pkg {
                                requirements.push(p.to_string());
                            }
                        }
                    }

                    scripts_map.insert(
                        key.clone(),
                        ResolvedScriptBundleDto {
                            key,
                            executor,
                            full_path,
                            requirements,
                            default_inputs,
                        },
                    );
                }
            }
        }

        if let Ok(const_items) = node_contracts::load_constant_items_from_db(db) {
            constants_map = node_contracts::compile_constant_specs(&const_items);
            raw_constants = const_items;
        }
    }

    for (slug, full_path, relative_path) in
        node_contracts::discover_component_pipelines(root_path, db_opt.as_ref())
    {
        let p_path = PathBuf::from(&full_path);
        let resolved = if p_path.is_file() {
            p_path
        } else {
            root_path.join(&relative_path)
        };
        if let Ok(yaml_str) = std::fs::read_to_string(&resolved) {
            if let Ok(parsed_comp) = serde_yaml::from_str::<Value>(&yaml_str) {
                components_map.insert(slug, parsed_comp);
            }
        }
    }

    if !raw_constants.is_empty() {
        node_contracts::expand_vars_in_dag_json(&mut root_pipeline, &raw_constants);
        for comp_doc in components_map.values_mut() {
            node_contracts::expand_vars_in_dag_json(comp_doc, &raw_constants);
        }
        for script_dto in scripts_map.values_mut() {
            for val in script_dto.default_inputs.values_mut() {
                node_contracts::expand_vars_in_json_value(val, &raw_constants);
            }
        }
        for val in runtime_inputs.values_mut() {
            node_contracts::expand_vars_in_json_value(val, &raw_constants);
        }
    }

    Ok(serde_json::json!({
        "bundleVersion": 2,
        "runId": run_id,
        "pipelineKind": pipeline_kind,
        "rootPipeline": root_pipeline,
        "runtimeInputs": runtime_inputs,
        "scripts": scripts_map,
        "components": components_map,
        "constants": constants_map,
    }))
}
