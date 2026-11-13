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

    let palette_path = forgity_dir.join("local_palette.json");
    let local_palette_json = if palette_path.is_file() {
        std::fs::read_to_string(&palette_path).ok()
    } else {
        None
    };

    let structs_path = forgity_dir.join("local_structs.json");
    let local_structs_json = if structs_path.is_file() {
        std::fs::read_to_string(&structs_path).ok()
    } else {
        None
    };

    let constants_path = forgity_dir.join("constants.json");
    let local_constants_json = if constants_path.is_file() {
        std::fs::read_to_string(&constants_path).ok()
    } else {
        None
    };

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
    let forgity_dir = Path::new(&root_path).join(".forgity");
    std::fs::create_dir_all(&forgity_dir)
        .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;

    std::fs::write(forgity_dir.join("local_palette.json"), palette_json)
        .map_err(|e| format!("Failed to write local_palette.json: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_local_palette(root_path: String) -> Result<String, String> {
    let palette_path = Path::new(&root_path).join(".forgity").join("local_palette.json");
    if !palette_path.is_file() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&palette_path)
        .map_err(|e| format!("Failed to read local_palette.json: {}", e))
}

#[tauri::command]
pub fn save_local_structs(root_path: String, structs_json: String) -> Result<(), String> {
    let forgity_dir = Path::new(&root_path).join(".forgity");
    std::fs::create_dir_all(&forgity_dir)
        .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;

    std::fs::write(forgity_dir.join("local_structs.json"), structs_json)
        .map_err(|e| format!("Failed to write local_structs.json: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_local_structs(root_path: String) -> Result<String, String> {
    let structs_path = Path::new(&root_path).join(".forgity").join("local_structs.json");
    if !structs_path.is_file() {
        return Ok("[]".to_string());
    }
    std::fs::read_to_string(&structs_path)
        .map_err(|e| format!("Failed to read local_structs.json: {}", e))
}

#[tauri::command]
pub fn save_local_constants(root_path: String, constants_json: String) -> Result<(), String> {
    let forgity_dir = Path::new(&root_path).join(".forgity");
    std::fs::create_dir_all(&forgity_dir)
        .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;

    std::fs::write(forgity_dir.join("constants.json"), constants_json)
        .map_err(|e| format!("Failed to write constants.json: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_local_constants(root_path: String) -> Result<String, String> {
    let constants_path = Path::new(&root_path).join(".forgity").join("constants.json");
    if !constants_path.is_file() {
        return Ok("[]".to_string());
    }
    std::fs::read_to_string(&constants_path)
        .map_err(|e| format!("Failed to read constants.json: {}", e))
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

