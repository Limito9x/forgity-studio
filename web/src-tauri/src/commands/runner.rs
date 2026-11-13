use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnrealProjectMapping {
    pub project_id: String,
    pub uproject_path: String,
    pub content_dir: String,
}

/// Finds the nearest runner.toml configuration file.
/// Precedence:
/// 1. ./runner.toml in current directory / workspace root
/// 2. %LOCALAPPDATA%\Forgity\runner.toml (System Global)
pub fn find_runner_config_path(workspace_root: Option<&str>) -> PathBuf {
    if let Some(ws) = workspace_root {
        let local_ws_path = Path::new(ws).join("runner.toml");
        if local_ws_path.is_file() {
            return local_ws_path;
        }
    }

    let cwd_local = Path::new("runner.toml");
    if cwd_local.is_file() {
        return cwd_local.to_path_buf();
    }

    // Windows local app data
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let global_path = Path::new(&local_app_data).join("Forgity").join("runner.toml");
        if global_path.is_file() {
            return global_path;
        }
    }

    // Default fallback to local runner.toml in CWD
    PathBuf::from("runner.toml")
}

#[tauri::command]
pub fn get_runner_unreal_project(
    workspace_root: Option<String>,
    project_id: String,
) -> Result<Option<UnrealProjectMapping>, String> {
    let cfg_path = find_runner_config_path(workspace_root.as_deref());
    if !cfg_path.is_file() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&cfg_path)
        .map_err(|e| format!("Failed to read runner.toml at {}: {}", cfg_path.display(), e))?;

    let parsed: toml::Value = toml::from_str(&content)
        .map_err(|e| format!("Failed to parse runner.toml: {}", e))?;

    // Look for [unreal_projects] table in runner.toml
    if let Some(projects_table) = parsed.get("unreal_projects").and_then(|t| t.as_table()) {
        if let Some(val) = projects_table.get(&project_id) {
            let uproject = match val {
                toml::Value::String(s) => s.clone(),
                toml::Value::Table(t) => t.get("uproject_path").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                _ => String::new(),
            };

            if !uproject.is_empty() {
                let upath = Path::new(&uproject);
                let content_dir = upath
                    .parent()
                    .map(|p| p.join("Content").to_string_lossy().replace('\\', "/"))
                    .unwrap_or_default();

                return Ok(Some(UnrealProjectMapping {
                    project_id,
                    uproject_path: uproject.replace('\\', "/"),
                    content_dir,
                }));
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn set_runner_unreal_project(
    workspace_root: Option<String>,
    project_id: String,
    uproject_path: String,
) -> Result<UnrealProjectMapping, String> {
    let cfg_path = find_runner_config_path(workspace_root.as_deref());
    let mut parsed: toml::Table = if cfg_path.is_file() {
        let content = std::fs::read_to_string(&cfg_path)
            .map_err(|e| format!("Failed to read runner.toml: {}", e))?;
        toml::from_str(&content).unwrap_or_default()
    } else {
        toml::Table::new()
    };

    let normalized_uproject = uproject_path.replace('\\', "/");
    let content_dir = Path::new(&normalized_uproject)
        .parent()
        .map(|p| p.join("Content").to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();

    let mut projects_table = match parsed.remove("unreal_projects") {
        Some(toml::Value::Table(t)) => t,
        _ => toml::Table::new(),
    };

    projects_table.insert(
        project_id.clone(),
        toml::Value::String(normalized_uproject.clone()),
    );

    parsed.insert(
        "unreal_projects".to_string(),
        toml::Value::Table(projects_table),
    );

    let toml_str = toml::to_string_pretty(&parsed)
        .map_err(|e| format!("Failed to serialize runner config: {}", e))?;

    if let Some(parent) = cfg_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    std::fs::write(&cfg_path, toml_str)
        .map_err(|e| format!("Failed to write runner.toml: {}", e))?;

    Ok(UnrealProjectMapping {
        project_id,
        uproject_path: normalized_uproject,
        content_dir,
    })
}

