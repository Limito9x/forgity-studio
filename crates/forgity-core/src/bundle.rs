use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::node_contracts;
use crate::workspace_db::WorkspaceDb;

fn sha256_file(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Some(hex::encode(hasher.finalize()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedScriptBundleDto {
    pub key: String,
    pub executor: String,
    pub full_path: String,
    #[serde(default)]
    pub inline_source: Option<String>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub source_ref: Option<Value>,
    pub requirements: Vec<String>,
    pub default_inputs: HashMap<String, Value>,
}

fn remap_workspace_assets_recursive(val: &mut Value, assets_dir: &Path) {
    match val {
        Value::String(s) => {
            if let Some(rel) = s.strip_prefix("workspace://assets/") {
                let physical = assets_dir.join(rel);
                *s = physical.to_string_lossy().to_string();
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                remap_workspace_assets_recursive(item, assets_dir);
            }
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                remap_workspace_assets_recursive(v, assets_dir);
            }
        }
        _ => {}
    }
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
        let mut raw_palette_items: Vec<Value> = Vec::new();

        // 1. From local_scripts
        if let Ok(palette_json) = db.load_palette_json() {
            if let Ok(parsed_palette) = serde_json::from_str::<Value>(&palette_json) {
                match parsed_palette {
                    Value::Object(map) => raw_palette_items.extend(map.into_values()),
                    Value::Array(arr) => raw_palette_items.extend(arr),
                    _ => {}
                }
            }
        }

        // 2. From workspace_palette (forked template contracts, etc.)
        if let Ok(persisted_contracts) = db.load_workspace_palette_contracts_raw() {
            for raw_json in persisted_contracts {
                if let Ok(item) = serde_json::from_str::<Value>(&raw_json) {
                    raw_palette_items.push(item);
                }
            }
        }

        for item in raw_palette_items {
            let key = item
                .get("key")
                .or_else(|| item.get("refId"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_default();
            if key.is_empty() {
                continue;
            }

            let executor = item
                .get("executor")
                .and_then(|v| v.as_str())
                .unwrap_or("python")
                .to_string();

            let mut default_inputs = HashMap::new();
            let inputs_arr = item
                .get("dataInputs")
                .and_then(|v| v.as_array())
                .or_else(|| item.get("inputs").and_then(|v| v.as_array()));
            if let Some(inputs) = inputs_arr {
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

            let inline_source = item
                .get("inlineSource")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let source_ref = item.get("sourceRef").cloned();
            let content_hash = source_ref
                .as_ref()
                .and_then(|sr| sr.get("contentHash"))
                .and_then(|v| v.as_str())
                .or_else(|| item.get("contentHash").and_then(|v| v.as_str()))
                .map(|s| s.to_string());

            // Physical path verification against workspace disk
            let candidate_full_path = item
                .get("fullPath")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
                .or_else(|| {
                    let bare_key = key
                        .strip_prefix("local:script:")
                        .or_else(|| key.strip_prefix("local:"))
                        .unwrap_or(&key);
                    let p = root_path.join("pipeline-scripts").join(bare_key);
                    if p.is_file() {
                        Some(p)
                    } else {
                        None
                    }
                });

            let verified_full_path = if let Some(ref p) = candidate_full_path {
                if p.is_file() {
                    if let Some(ref expected_hash) = content_hash {
                        if !expected_hash.is_empty() {
                            if let Some(actual_hash) = sha256_file(p) {
                                if actual_hash.eq_ignore_ascii_case(expected_hash) {
                                    p.to_string_lossy().to_string()
                                } else {
                                    String::new()
                                }
                            } else {
                                String::new()
                            }
                        } else {
                            p.to_string_lossy().to_string()
                        }
                    } else {
                        p.to_string_lossy().to_string()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            scripts_map.insert(
                key.clone(),
                ResolvedScriptBundleDto {
                    key,
                    executor,
                    full_path: verified_full_path,
                    inline_source,
                    content_hash,
                    source_ref,
                    requirements,
                    default_inputs,
                },
            );
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

    // Remap workspace://assets/ references recursively across root_pipeline, components, runtime_inputs, and default_inputs
    let assets_dir = root_path.join("assets");
    remap_workspace_assets_recursive(&mut root_pipeline, &assets_dir);
    for comp_doc in components_map.values_mut() {
        remap_workspace_assets_recursive(comp_doc, &assets_dir);
    }
    for val in runtime_inputs.values_mut() {
        remap_workspace_assets_recursive(val, &assets_dir);
    }
    for script_dto in scripts_map.values_mut() {
        for val in script_dto.default_inputs.values_mut() {
            remap_workspace_assets_recursive(val, &assets_dir);
        }
    }

    let mut cloud_lease: Option<Value> = None;
    if let Some(ref db) = db_opt {
        if let Ok(Some(origin_template_id)) = db.get_workspace_meta("origin_template_id") {
            if !origin_template_id.trim().is_empty() {
                let origin_version_id = db
                    .get_workspace_meta("origin_version_id")
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                let origin_template_slug = db
                    .get_workspace_meta("origin_template_slug")
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                cloud_lease = Some(serde_json::json!({
                    "templateViewId": origin_template_id,
                    "templatePackageId": origin_template_id,
                    "pipelineVersionId": origin_version_id,
                    "templateSlug": origin_template_slug,
                    "machineKey": "",
                }));
            }
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
        "cloudLease": cloud_lease,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_execution_bundle_distinguishes_local_and_template_scripts() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path();
        let db = WorkspaceDb::open(root).unwrap();

        // 1. Create a physical local script in pipeline-scripts/
        let scripts_dir = root.join("pipeline-scripts").join("local");
        std::fs::create_dir_all(&scripts_dir).unwrap();
        let local_file = scripts_dir.join("test.py");
        std::fs::write(&local_file, "print('hello')").unwrap();
        let local_hash = sha256_file(&local_file).unwrap();

        let local_script = serde_json::json!({
            "key": "local:script:local/test.py",
            "executor": "python",
            "fullPath": local_file.to_string_lossy().to_string(),
            "contentHash": local_hash,
            "inputs": []
        });
        db.save_palette_json(&serde_json::to_string(&vec![local_script]).unwrap())
            .unwrap();

        // 2. Add a template-only script to workspace_palette (no file on disk)
        let template_script = serde_json::json!({
            "refId": "script:remote/bake.py",
            "key": "script:remote/bake.py",
            "name": "Bake Mesh",
            "executor": "blender",
            "contentHash": "8f3a9b1c00000000000000000000000000000000000000000000000000000000",
            "sourceRef": {
                "kind": "template",
                "ref": "script:remote/bake.py",
                "ownerSlug": "vfx-pack",
                "contentHash": "8f3a9b1c00000000000000000000000000000000000000000000000000000000"
            }
        });
        db.upsert_workspace_palette_contract(
            "script:remote/bake.py",
            &serde_json::to_string(&template_script).unwrap(),
            "template",
            "vfx-pack",
            Some("8f3a9b1c00000000000000000000000000000000000000000000000000000000"),
        )
        .unwrap();

        // 3. Set workspace origin template metadata
        db.set_workspace_meta("origin_template_id", "tpl-123").unwrap();
        db.set_workspace_meta("origin_version_id", "ver-456").unwrap();
        db.set_workspace_meta("origin_template_slug", "vfx-pack").unwrap();

        let yaml_content = "name: test_pipe\nkind: component\nexecutor: python\nnodes: []\nedges: []\n";
        let bundle_val = build_execution_bundle(root, "run-1", yaml_content, "component", HashMap::new()).unwrap();

        let scripts = bundle_val.get("scripts").unwrap().as_object().unwrap();
        let local_dto = scripts.get("local:script:local/test.py").unwrap();
        assert_eq!(local_dto.get("fullPath").unwrap().as_str().unwrap(), local_file.to_string_lossy().to_string());

        let template_dto = scripts.get("script:remote/bake.py").unwrap();
        assert_eq!(template_dto.get("fullPath").unwrap().as_str().unwrap(), "");
        assert_eq!(
            template_dto.get("contentHash").unwrap().as_str().unwrap(),
            "8f3a9b1c00000000000000000000000000000000000000000000000000000000"
        );

        let cloud_lease = bundle_val.get("cloudLease").unwrap();
        assert_eq!(cloud_lease.get("templatePackageId").unwrap().as_str().unwrap(), "tpl-123");
        assert_eq!(cloud_lease.get("pipelineVersionId").unwrap().as_str().unwrap(), "ver-456");
        assert_eq!(cloud_lease.get("templateSlug").unwrap().as_str().unwrap(), "vfx-pack");
    }
}
