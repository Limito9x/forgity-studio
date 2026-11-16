pub use forgity_core::node_contracts::{
    build_builtin_system_palette_items, build_component_palette_items,
    build_constant_palette_items, compile_constant_specs, discover_component_pipelines,
    expand_vars_in_dag_json, expand_vars_in_json_value, load_constant_items_from_db,
    RawConstantItem, ResolvedConstantSpec,
};
use serde_json::Value;

#[tauri::command]
pub fn load_constant_palette(root_path: String) -> Result<Vec<Value>, String> {
    forgity_core::node_contracts::load_constant_palette(root_path)
}

#[tauri::command]
pub fn load_workspace_node_contracts(root_path: String) -> Result<Vec<Value>, String> {
    forgity_core::node_contracts::load_workspace_node_contracts(root_path)
}
