use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRootConfig {
    pub version: u32,
    pub scripts_dir: String,
    pub pipelines_dir: String,
    #[serde(default)]
    pub ignore_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInitResult {
    pub root_path: String,
    pub config: WorkspaceRootConfig,
    pub local_palette_json: Option<String>,
    pub local_structs_json: Option<String>,
    pub local_constants_json: Option<String>,
}

#[tauri::command]
pub fn open_or_init_workspace_root(root_path: String) -> Result<WorkspaceInitResult, String> {
    let root = Path::new(&root_path);
    if !root.is_dir() {
        return Err(format!("Workspace root path is not a directory: {}", root_path));
    }

    let forgity_dir = root.join(".forgity");
    if !forgity_dir.exists() {
        std::fs::create_dir_all(&forgity_dir)
            .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;
    }

    let config_path = forgity_dir.join("workspace.json");
    let config = if config_path.is_file() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read workspace.json: {}", e))?;
        serde_json::from_str::<WorkspaceRootConfig>(&content)
            .unwrap_or_else(|_| WorkspaceRootConfig {
                version: 1,
                scripts_dir: "pipeline-scripts".to_string(),
                pipelines_dir: "pipelines".to_string(),
                ignore_patterns: Vec::new(),
            })
    } else {
        let scripts_dir = if root.join("pipeline-scripts").is_dir() {
            "pipeline-scripts".to_string()
        } else if root.join("scripts").is_dir() {
            "scripts".to_string()
        } else {
            ".".to_string()
        };

        let cfg = WorkspaceRootConfig {
            version: 1,
            scripts_dir,
            pipelines_dir: "pipelines".to_string(),
            ignore_patterns: Vec::new(),
        };

        let json_str = serde_json::to_string_pretty(&cfg)
            .map_err(|e| format!("Failed to serialize workspace config: {}", e))?;
        let _ = std::fs::write(&config_path, json_str);
        cfg
    };

    let pipelines_full_dir = root.join(&config.pipelines_dir);
    if !pipelines_full_dir.exists() {
        let _ = std::fs::create_dir_all(&pipelines_full_dir);
    }

    let db = super::workspace_db::WorkspaceDb::open(root)?;
    db.migrate_legacy_json_if_needed(root)?;

    let local_palette_json = db.load_palette_json().ok().filter(|s| s != "{}");
    let local_structs_json = db.load_structs_json().ok().filter(|s| s != "[]");
    let local_constants_json = db.load_constants_json().ok().filter(|s| s != "[]");

    Ok(WorkspaceInitResult {
        root_path,
        config,
        local_palette_json,
        local_structs_json,
        local_constants_json,
    })
}

#[tauri::command]
pub fn save_workspace_root_config(
    root_path: String,
    scripts_dir: String,
    pipelines_dir: String,
    ignore_patterns: Option<Vec<String>>,
) -> Result<(), String> {
    let forgity_dir = Path::new(&root_path).join(".forgity");
    std::fs::create_dir_all(&forgity_dir)
        .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;

    let cfg = WorkspaceRootConfig {
        version: 1,
        scripts_dir,
        pipelines_dir,
        ignore_patterns: ignore_patterns.unwrap_or_default(),
    };
    let json_str = serde_json::to_string_pretty(&cfg)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(forgity_dir.join("workspace.json"), json_str)
        .map_err(|e| format!("Failed to write workspace.json: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn save_local_palette(root_path: String, palette_json: String) -> Result<(), String> {
    let root = Path::new(&root_path);
    let db = super::workspace_db::WorkspaceDb::open(root)?;
    db.save_palette_json(&palette_json)
}

#[tauri::command]
pub fn load_local_palette(root_path: String) -> Result<String, String> {
    let root = Path::new(&root_path);
    let db = super::workspace_db::WorkspaceDb::open(root)?;
    db.migrate_legacy_json_if_needed(root)?;
    db.load_palette_json()
}

#[tauri::command]
pub fn save_local_structs(root_path: String, structs_json: String) -> Result<(), String> {
    let root = Path::new(&root_path);
    let db = super::workspace_db::WorkspaceDb::open(root)?;
    db.save_structs_json(&structs_json)?;

    let mut contracts = super::contracts::load_contracts_file(root);
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&structs_json) {
        contracts.structs = arr;
        let _ = super::contracts::save_contracts_file(root, &contracts);
    }
    Ok(())
}

#[tauri::command]
pub fn load_local_structs(root_path: String) -> Result<String, String> {
    let root = Path::new(&root_path);
    let db = super::workspace_db::WorkspaceDb::open(root)?;
    db.migrate_legacy_json_if_needed(root)?;
    db.load_structs_json()
}

#[tauri::command]
pub fn save_local_constants(root_path: String, constants_json: String) -> Result<(), String> {
    let root = Path::new(&root_path);
    let db = super::workspace_db::WorkspaceDb::open(root)?;
    db.save_constants_json(&constants_json)?;

    let mut contracts = super::contracts::load_contracts_file(root);
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&constants_json) {
        contracts.constants = arr;
        let _ = super::contracts::save_contracts_file(root, &contracts);
    }
    Ok(())
}

#[tauri::command]
pub fn load_local_constants(root_path: String) -> Result<String, String> {
    let root = Path::new(&root_path);
    let db = super::workspace_db::WorkspaceDb::open(root)?;
    db.migrate_legacy_json_if_needed(root)?;
    db.load_constants_json()
}

#[tauri::command]
pub fn save_local_script_override(
    root_path: String,
    script_key: String,
    override_json: String,
) -> Result<(), String> {
    let root = Path::new(&root_path);
    let ov: super::contracts::ScriptOverride = serde_json::from_str(&override_json)
        .map_err(|e| format!("Invalid script override JSON: {}", e))?;
    let mut contracts = super::contracts::load_contracts_file(root);
    contracts.script_overrides.insert(script_key, ov);
    super::contracts::save_contracts_file(root, &contracts)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnrealContentItem {
    pub name: String,
    pub relative_path: String,
    pub virtual_path: String,
    pub is_directory: bool,
    pub extension: Option<String>,
}

#[tauri::command]
pub fn list_unreal_content_items(
    content_dir: String,
    sub_path: Option<String>,
) -> Result<Vec<UnrealContentItem>, String> {
    let base_content = Path::new(&content_dir);
    if !base_content.is_dir() {
        return Err(format!("Content directory does not exist: {}", content_dir));
    }

    let target_dir = match &sub_path {
        Some(sub) if !sub.trim().is_empty() => base_content.join(sub.trim_start_matches(['/', '\\'])),
        _ => base_content.to_path_buf(),
    };

    if !target_dir.is_dir() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&target_dir)
        .map_err(|e| format!("Failed to read content directory: {}", e))?;

    let mut items: Vec<UnrealContentItem> = Vec::new();
    let ignore_dirs = ["__ExternalActors__", "__ExternalObjects__", ".git", ".svn", "Developers", "Collections"];

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if ignore_dirs.contains(&file_name.as_str()) {
                continue;
            }
            let rel = path
                .strip_prefix(base_content)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| file_name.clone());
            let virt = format!("/Game/{}", rel.trim_start_matches('/'));

            items.push(UnrealContentItem {
                name: file_name,
                relative_path: rel,
                virtual_path: virt,
                is_directory: true,
                extension: None,
            });
        } else {
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());
            if let Some(ref ext_str) = ext {
                if ext_str == "uasset" || ext_str == "umap" {
                    let rel = path
                        .strip_prefix(base_content)
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| file_name.clone());
                    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or(file_name.clone());
                    let parent_rel = path
                        .parent()
                        .and_then(|p| p.strip_prefix(base_content).ok())
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_default();
                    let virt = if parent_rel.is_empty() {
                        format!("/Game/{}", stem)
                    } else {
                        format!("/Game/{}/{}", parent_rel.trim_matches('/'), stem)
                    };

                    items.push(UnrealContentItem {
                        name: file_name,
                        relative_path: rel,
                        virtual_path: virt,
                        is_directory: false,
                        extension: Some(ext_str.clone()),
                    });
                }
            }
        }
    }

    items.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(items)
}

// ==========================================
// Workspace Registry Commands (AppData SSOT)
// ==========================================

pub use forgity_core::workspace_registry::{RegisteredWorkspace, WorkspaceRegistryDb};
use tauri::Manager;

fn get_app_data_registry(app: &tauri::AppHandle) -> Result<WorkspaceRegistryDb, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app_data_dir: {}", e))?;
    WorkspaceRegistryDb::open(&app_data_dir)
}

#[tauri::command]
pub fn list_registered_workspaces(app: tauri::AppHandle) -> Result<Vec<RegisteredWorkspace>, String> {
    let registry = get_app_data_registry(&app)?;
    registry.list_workspaces()
}

#[tauri::command]
pub fn get_registered_workspace(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<Option<RegisteredWorkspace>, String> {
    let registry = get_app_data_registry(&app)?;
    registry.get_workspace_by_id(&workspace_id)
}

#[tauri::command]
pub fn register_workspace(
    app: tauri::AppHandle,
    name: String,
    root_path: String,
    linked_project_id: Option<String>,
    origin_template_id: Option<String>,
    origin_version_id: Option<String>,
    origin_template_title: Option<String>,
) -> Result<RegisteredWorkspace, String> {
    let root = Path::new(&root_path);
    if !root.is_dir() {
        return Err(format!("Workspace root path is not a valid directory: {}", root_path));
    }

    // Ensure workspace is initialized
    let _ = open_or_init_workspace_root(root_path.clone())?;

    let registry = get_app_data_registry(&app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());

    // Check if already registered by root_path
    if let Ok(Some(mut existing)) = registry.get_workspace_by_root_path(&root_path) {
        existing.last_opened_at = now.clone();
        if !name.trim().is_empty() {
            existing.name = name;
        }
        if linked_project_id.is_some() {
            existing.linked_project_id = linked_project_id;
        }
        registry.upsert_workspace(&existing)?;
        return Ok(existing);
    }

    let id = format!("ws_{}", &now);
    let ws = RegisteredWorkspace {
        id,
        name,
        root_path,
        linked_project_id,
        origin_template_id,
        origin_version_id,
        origin_template_title,
        last_opened_at: now.clone(),
        created_at: now,
    };

    registry.upsert_workspace(&ws)?;
    Ok(ws)
}

#[tauri::command]
pub fn touch_workspace_opened(app: tauri::AppHandle, workspace_id: String) -> Result<(), String> {
    let registry = get_app_data_registry(&app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    registry.touch_workspace(&workspace_id, &now)
}

#[tauri::command]
pub fn remove_workspace_from_registry(app: tauri::AppHandle, workspace_id: String) -> Result<(), String> {
    let registry = get_app_data_registry(&app)?;
    registry.remove_workspace(&workspace_id)
}

#[tauri::command]
pub fn reveal_workspace_in_explorer(root_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&root_path)
            .spawn()
            .map_err(|e| format!("Failed to open explorer for path '{}': {}", root_path, e))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&root_path)
            .spawn()
            .map_err(|e| format!("Failed to open finder for path '{}': {}", root_path, e))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&root_path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager for path '{}': {}", root_path, e))?;
        Ok(())
    }
}



