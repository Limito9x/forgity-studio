pub use forgity_core::analyzer::{
    AnalyzedLocalScriptItem, LocalStructDefinitionDto, LocalStructFieldDto, PinDefinitionDto,
    ScannedScriptItem, ScriptDependencyDto, ScriptFolderInput,
};

#[tauri::command]
pub fn scan_local_script_folders(
    folders: Vec<ScriptFolderInput>,
    custom_ignores: Option<Vec<String>>,
) -> Vec<ScannedScriptItem> {
    forgity_core::analyzer::scan_local_script_folders(folders, custom_ignores)
}

#[tauri::command]
pub fn analyze_local_scripts_native(
    folders: Vec<ScriptFolderInput>,
    custom_ignores: Option<Vec<String>>,
) -> Result<Vec<AnalyzedLocalScriptItem>, String> {
    forgity_core::analyzer::analyze_local_scripts_native(folders, custom_ignores)
}
