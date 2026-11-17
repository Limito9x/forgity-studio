use std::path::Path;

use forgity_core::template_manifest::{
    build_template_dependency_manifest, TemplateDependencyManifest,
};

/// Scans the local workspace and returns the dependency manifest of the selected pipelines
/// (plus their transitive component pipes, scripts, constants and assets).
///
/// The canonical graph comes from the SQLite snapshot (`local_pipelines.snapshot_json`); the YAML
/// draft is only read for cross-checking and for `metadata.sourcePath` fallback.
#[tauri::command]
pub fn scan_template_dependencies(
    root_path: String,
    root_pipeline_paths: Vec<String>,
    persist: Option<bool>,
) -> Result<TemplateDependencyManifest, String> {
    let root = Path::new(&root_path);
    if !root.is_dir() {
        return Err(format!(
            "Workspace root path is not a directory: {}",
            root_path
        ));
    }

    Ok(build_template_dependency_manifest(
        root,
        &root_pipeline_paths,
        persist.unwrap_or(true),
    ))
}
