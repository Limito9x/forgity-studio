use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRootConfig {
    pub version: u32,
    pub scripts_dir: String,
    pub pipelines_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInitResult {
    pub root_path: String,
    pub config: WorkspaceRootConfig,
    pub local_palette_json: Option<String>,
    pub local_structs_json: Option<String>,
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

    Ok(WorkspaceInitResult {
        root_path,
        config,
        local_palette_json,
        local_structs_json,
    })
}

#[tauri::command]
pub fn save_workspace_root_config(
    root_path: String,
    scripts_dir: String,
    pipelines_dir: String,
) -> Result<(), String> {
    let forgity_dir = Path::new(&root_path).join(".forgity");
    std::fs::create_dir_all(&forgity_dir)
        .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;

    let cfg = WorkspaceRootConfig {
        version: 1,
        scripts_dir,
        pipelines_dir,
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

