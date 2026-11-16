pub use forgity_core::pipeline::{
    scan_yaml_recursive, LocalPipelineRunResult, ScannedPipelineYamlItem,
};

#[tauri::command]
pub fn scan_local_pipeline_drafts(folder_path: String) -> Vec<ScannedPipelineYamlItem> {
    forgity_core::pipeline::scan_local_pipeline_drafts(folder_path)
}

#[tauri::command]
pub fn create_local_pipeline_draft(
    pipelines_dir_path: String,
    name: String,
    kind: Option<String>,
    executor: Option<String>,
) -> Result<ScannedPipelineYamlItem, String> {
    forgity_core::pipeline::create_local_pipeline_draft(pipelines_dir_path, name, kind, executor)
}

#[tauri::command]
pub fn save_local_pipeline_draft(file_path: String, content: String) -> Result<(), String> {
    forgity_core::pipeline::save_local_pipeline_draft(file_path, content)
}

#[tauri::command]
pub fn rename_local_pipeline_draft(
    old_file_path: String,
    new_name: String,
) -> Result<ScannedPipelineYamlItem, String> {
    forgity_core::pipeline::rename_local_pipeline_draft(old_file_path, new_name)
}

#[tauri::command]
pub fn duplicate_local_pipeline_draft(file_path: String) -> Result<ScannedPipelineYamlItem, String> {
    forgity_core::pipeline::duplicate_local_pipeline_draft(file_path)
}

#[tauri::command]
pub fn save_local_pipeline_snapshot(
    root_path: String,
    pipeline_slug: String,
    snapshot_json: String,
) -> Result<(), String> {
    forgity_core::pipeline::save_local_pipeline_snapshot(root_path, pipeline_slug, snapshot_json)
}

#[tauri::command]
pub fn load_local_pipeline_snapshot(
    root_path: String,
    pipeline_slug: String,
) -> Result<Option<String>, String> {
    forgity_core::pipeline::load_local_pipeline_snapshot(root_path, pipeline_slug)
}

#[tauri::command]
pub fn delete_local_pipeline_draft(file_path: String) -> Result<(), String> {
    forgity_core::pipeline::delete_local_pipeline_draft(file_path)
}

#[tauri::command]
pub async fn run_local_pipeline_draft_native(
    root_path: String,
    pipeline_file_path: String,
) -> Result<LocalPipelineRunResult, String> {
    forgity_core::pipeline::run_local_pipeline_draft_native(root_path, pipeline_file_path).await
}
