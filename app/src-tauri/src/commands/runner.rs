use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRunnerConfigDto {
    pub config_path: String,
    pub exists: bool,
    pub runner_id: Option<String>,
    pub name: Option<String>,
    pub runner_executable: String,
    pub executors: HashMap<String, String>,
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDccAppDto {
    pub name: String,
    pub version: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDccScanResultDto {
    pub runner_executable: String,
    pub blender: Vec<LocalDccAppDto>,
    pub unreal: Vec<LocalDccAppDto>,
    pub python: Vec<LocalDccAppDto>,
}

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
        if global_path.is_file() || workspace_root.is_none() {
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

#[tauri::command]
pub fn get_local_runner_config(workspace_root: Option<String>) -> Result<LocalRunnerConfigDto, String> {
    let cfg_path = find_runner_config_path(workspace_root.as_deref());
    let runner_executable = super::local_execution::resolve_runner_executable()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| "forgity-runner".to_string());

    if !cfg_path.is_file() {
        return Ok(LocalRunnerConfigDto {
            config_path: cfg_path.to_string_lossy().replace('\\', "/"),
            exists: false,
            runner_id: None,
            name: None,
            runner_executable,
            executors: HashMap::new(),
            env: HashMap::new(),
        });
    }

    let content = std::fs::read_to_string(&cfg_path)
        .map_err(|e| format!("Failed to read runner.toml at {}: {}", cfg_path.display(), e))?;
    let parsed: toml::Table = toml::from_str(&content)
        .map_err(|e| format!("Failed to parse runner.toml: {}", e))?;

    let runner_id = parsed.get("runner_id").and_then(|v| v.as_str()).map(String::from);
    let name = parsed.get("name").and_then(|v| v.as_str()).map(String::from);

    let mut executors = HashMap::new();
    if let Some(table) = parsed.get("executors").and_then(|v| v.as_table()) {
        for (k, v) in table {
            if let Some(s) = v.as_str() {
                executors.insert(k.clone(), s.to_string());
            }
        }
    }

    let mut env = HashMap::new();
    if let Some(table) = parsed.get("env").and_then(|v| v.as_table()) {
        for (k, v) in table {
            if let Some(s) = v.as_str() {
                env.insert(k.clone(), s.to_string());
            }
        }
    }

    Ok(LocalRunnerConfigDto {
        config_path: cfg_path.to_string_lossy().replace('\\', "/"),
        exists: true,
        runner_id,
        name,
        runner_executable,
        executors,
        env,
    })
}

#[tauri::command]
pub fn save_local_runner_config(
    workspace_root: Option<String>,
    executors: HashMap<String, String>,
    env: HashMap<String, String>,
) -> Result<LocalRunnerConfigDto, String> {
    let cfg_path = find_runner_config_path(workspace_root.as_deref());
    let mut parsed: toml::Table = if cfg_path.is_file() {
        let content = std::fs::read_to_string(&cfg_path)
            .map_err(|e| format!("Failed to read runner.toml: {}", e))?;
        toml::from_str(&content).unwrap_or_default()
    } else {
        toml::Table::new()
    };

    let mut exec_table = toml::Table::new();
    for (k, v) in executors {
        let key = k.trim().to_lowercase();
        let val = v.trim().replace('\\', "/");
        if !key.is_empty() && !val.is_empty() {
            exec_table.insert(key, toml::Value::String(val));
        }
    }
    if exec_table.is_empty() {
        parsed.remove("executors");
    } else {
        parsed.insert("executors".to_string(), toml::Value::Table(exec_table));
    }

    let mut env_table = toml::Table::new();
    for (k, v) in env {
        let key = k.trim().to_string();
        if !key.is_empty() {
            env_table.insert(key, toml::Value::String(v));
        }
    }
    if env_table.is_empty() {
        parsed.remove("env");
    } else {
        parsed.insert("env".to_string(), toml::Value::Table(env_table));
    }

    if let Some(parent) = cfg_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let toml_str = toml::to_string_pretty(&parsed)
        .map_err(|e| format!("Failed to serialize runner.toml: {}", e))?;
    std::fs::write(&cfg_path, toml_str)
        .map_err(|e| format!("Failed to write runner.toml: {}", e))?;

    get_local_runner_config(workspace_root)
}

#[tauri::command]
pub fn scan_local_dcc_executors() -> Result<LocalDccScanResultDto, String> {
    let runner_bin = super::local_execution::resolve_runner_executable()?;
    let runner_path_str = runner_bin.to_string_lossy().replace('\\', "/");

    let mut cmd = Command::new(&runner_bin);
    cmd.args(["dcc", "scan", "--json"]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().map_err(|e| {
        format!(
            "Failed to invoke forgity-runner at '{}': {}",
            runner_path_str, e
        )
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("forgity-runner dcc scan failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawScanResult {
        #[serde(default)]
        blender: Vec<LocalDccAppDto>,
        #[serde(default)]
        unreal: Vec<LocalDccAppDto>,
        #[serde(default)]
        python: Vec<LocalDccAppDto>,
    }

    let parsed: RawScanResult = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse DCC scan JSON output: {}", e))?;

    Ok(LocalDccScanResultDto {
        runner_executable: runner_path_str,
        blender: parsed.blender,
        unreal: parsed.unreal,
        python: parsed.python,
    })
}

