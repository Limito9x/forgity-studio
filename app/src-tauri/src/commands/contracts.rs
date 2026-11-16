pub use forgity_core::script_contracts::{
    apply_script_override_to_json, contracts_path, load_contracts_file, save_contracts_file,
    ScriptOverride, WorkspaceContractsFile,
};

use forgity_core::contracts::{
    self, ContractGraphEdge, ContractGraphNode, PaletteNodeSummary, PipelineContractSpec,
    PipelineKind, ValidationReport,
};
use std::collections::HashMap;
use std::path::Path;

#[tauri::command]
pub fn save_script_override(
    root_path: String,
    script_key: String,
    override_json: String,
) -> Result<String, String> {
    forgity_core::script_contracts::save_script_override(root_path, script_key, override_json)
}

#[tauri::command]
pub fn clear_script_override(
    root_path: String,
    script_key: String,
    pin_id: Option<String>,
) -> Result<(), String> {
    forgity_core::script_contracts::clear_script_override(root_path, script_key, pin_id)
}

/// Returns the canonical Pipeline Contract Specification (Single Source of Truth) for UI/Canvas.
#[tauri::command]
pub fn get_pipeline_contract_spec() -> PipelineContractSpec {
    contracts::get_pipeline_contract_spec()
}

/// Validates a local pipeline graph against the canonical Contract Specification.
#[tauri::command]
pub fn validate_local_pipeline_graph(
    root_path: Option<String>,
    pipeline_kind: String,
    executor: Option<String>,
    nodes: Vec<ContractGraphNode>,
    edges: Vec<ContractGraphEdge>,
) -> ValidationReport {
    let kind = PipelineKind::from_str_lossy(&pipeline_kind).unwrap_or(PipelineKind::Master);

    let palette_lookup: Option<HashMap<String, PaletteNodeSummary>> = root_path
        .and_then(|rp| {
            let p = Path::new(&rp);
            if p.join(".forgity").join("workspace.db").is_file() {
                forgity_core::node_contracts::load_workspace_node_contracts(rp).ok()
            } else {
                None
            }
        })
        .map(|items| {
            let mut map = HashMap::new();
            for item in items {
                let key = item
                    .get("key")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase();
                if key.is_empty() {
                    continue;
                }
                let source = item
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let exec = item
                    .get("executor")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let category = item
                    .get("category")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let has_exec_pins = item
                    .get("inputs")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter().any(|p| {
                            p.get("kind")
                                .and_then(|k| k.as_str())
                                .map(|k| k.eq_ignore_ascii_case("Exec"))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);
                map.insert(
                    key.clone(),
                    PaletteNodeSummary {
                        key,
                        source,
                        executor: exec,
                        category,
                        has_exec_pins,
                    },
                );
            }
            map
        });

    contracts::validate_pipeline_graph(
        kind,
        executor.as_deref(),
        &nodes,
        &edges,
        palette_lookup.as_ref(),
        false,
    )
}
