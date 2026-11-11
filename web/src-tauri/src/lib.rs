use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMachineInfo {
    pub is_desktop: bool,
    pub hardware_fingerprint: String,
    pub machine_key: String,
    pub hostname: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptFolderInput {
    pub namespace: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedScriptItem {
    pub namespace: String,
    pub key: String,
    pub file_name: String,
    pub relative_path: String,
    pub full_path: String,
    pub folder_root: String,
    pub content: String,
    pub content_hash: String,
    pub last_modified_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedPipelineYamlItem {
    pub file_name: String,
    pub relative_path: String,
    pub full_path: String,
    pub content: String,
    pub last_modified_ms: u64,
}

fn compute_hardware_fingerprint() -> String {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(crypto_key) = hklm.open_subkey(r"SOFTWARE\Microsoft\Cryptography") {
            if let Ok(guid) = crypto_key.get_value::<String, _>("MachineGuid") {
                let mut hasher = Sha256::new();
                hasher.update(guid.trim().as_bytes());
                return format!("{:x}", hasher.finalize());
            }
        }
    }

    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DESKTOP".to_string());
    let mut hasher = Sha256::new();
    hasher.update(hostname.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn compute_permanent_machine_key(hostname: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(crypto_key) = hklm.open_subkey(r"SOFTWARE\Microsoft\Cryptography") {
            if let Ok(guid) = crypto_key.get_value::<String, _>("MachineGuid") {
                let clean_guid = guid.replace('-', "");
                let short = if clean_guid.len() >= 14 {
                    &clean_guid[..14]
                } else {
                    &clean_guid
                };
                return format!("{}-{}", hostname, short);
            }
        }
    }

    format!("{}-PERMANENT", hostname)
}

#[tauri::command]
fn get_local_machine_info() -> LocalMachineInfo {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DESKTOP".to_string());

    let hardware_fingerprint = compute_hardware_fingerprint();
    let machine_key = compute_permanent_machine_key(&hostname);

    LocalMachineInfo {
        is_desktop: true,
        hardware_fingerprint,
        machine_key,
        hostname,
    }
}

fn is_hex_hash_stem(stem: &str) -> bool {
    if stem.len() < 32 {
        return false;
    }
    stem.chars().all(|c| c.is_ascii_hexdigit())
}

fn is_ignored_dir(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    matches!(
        name.to_ascii_lowercase().as_str(),
        "__pycache__"
            | "venv"
            | ".venv"
            | "env"
            | "node_modules"
            | "target"
            | "bin"
            | "obj"
            | "dist"
            | "build"
            | "cache"
            | "temp"
            | "tmp"
            | "logs"
            | "presets"
            | "tests"
            | "test"
            | "scratch"
            | "runner"
            | "api"
            | "web"
            | "packages"
            | "tools"
    )
}

fn is_ignored_python_file(path: &Path, file_name: &str) -> bool {
    let lower_name = file_name.to_ascii_lowercase();
    if lower_name == "__init__.py"
        || lower_name == "__main__.py"
        || lower_name == "setup.py"
        || lower_name == "conftest.py"
        || lower_name == "script_harness.py"
        || lower_name.starts_with("test_")
        || lower_name.ends_with("_test.py")
        || lower_name.ends_with("_check.py")
    {
        return true;
    }

    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        if is_hex_hash_stem(stem) {
            return true;
        }
    }

    false
}

fn scan_dir_recursive(
    root_path: &Path,
    current_dir: &Path,
    results: &mut Vec<ScannedScriptItem>,
) {
    let read_dir = match std::fs::read_dir(current_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if !is_ignored_dir(&file_name) {
                scan_dir_recursive(root_path, &path, results);
            }
        } else if path.is_file() {
            let is_python = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("py"))
                .unwrap_or(false);

            if !is_python || is_ignored_python_file(&path, &file_name) {
                continue;
            }

            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let mut hasher = Sha256::new();
            hasher.update(content.as_bytes());
            let content_hash = format!("{:x}", hasher.finalize());

            let relative = match path.strip_prefix(root_path) {
                Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
                Err(_) => file_name.clone(),
            };

            let relative_no_ext = if let Some(stripped) = relative.strip_suffix(".py") {
                stripped
            } else if let Some(stripped) = relative.strip_suffix(".PY") {
                stripped
            } else {
                &relative
            };

            let key = relative_no_ext.to_string();

            let last_modified_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            results.push(ScannedScriptItem {
                namespace: String::new(),
                key,
                file_name,
                relative_path: relative,
                full_path: path.to_string_lossy().replace('\\', "/"),
                folder_root: root_path.to_string_lossy().replace('\\', "/"),
                content,
                content_hash,
                last_modified_ms,
            });
        }
    }
}

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
}

#[tauri::command]
fn open_or_init_workspace_root(root_path: String) -> Result<WorkspaceInitResult, String> {
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

    Ok(WorkspaceInitResult {
        root_path,
        config,
        local_palette_json,
    })
}

#[tauri::command]
fn save_workspace_root_config(
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
fn save_local_palette(root_path: String, palette_json: String) -> Result<(), String> {
    let forgity_dir = Path::new(&root_path).join(".forgity");
    std::fs::create_dir_all(&forgity_dir)
        .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;

    std::fs::write(forgity_dir.join("local_palette.json"), palette_json)
        .map_err(|e| format!("Failed to write local_palette.json: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_local_palette(root_path: String) -> Result<String, String> {
    let palette_path = Path::new(&root_path).join(".forgity").join("local_palette.json");
    if !palette_path.is_file() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&palette_path)
        .map_err(|e| format!("Failed to read local_palette.json: {}", e))
}

#[tauri::command]
fn create_local_pipeline_draft(
    pipelines_dir_path: String,
    name: String,
) -> Result<ScannedPipelineYamlItem, String> {
    let dir = Path::new(&pipelines_dir_path);
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create pipelines directory: {}", e))?;

    let slug: String = name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let clean_slug = slug.trim_matches('_');
    let file_slug = if clean_slug.is_empty() { "pipeline" } else { clean_slug };
    let file_name = format!("{}.pipeline.yaml", file_slug);
    let full_path = dir.join(&file_name);

    let default_yaml = format!(
        "name: \"{}\"\nversion: \"draft\"\nrunner: \"local\"\nnodes:\n  - id: start\n    tool: Start\n    label: \"Start Pipeline\"\n  - id: return\n    tool: Return\n    label: \"Return\"\nedges: []\n",
        name
    );

    std::fs::write(&full_path, &default_yaml)
        .map_err(|e| format!("Failed to write draft pipeline: {}", e))?;

    let last_modified_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(ScannedPipelineYamlItem {
        file_name,
        relative_path: file_slug.to_string(),
        full_path: full_path.to_string_lossy().replace('\\', "/"),
        content: default_yaml,
        last_modified_ms,
    })
}

#[tauri::command]
fn save_local_pipeline_draft(file_path: String, content: String) -> Result<(), String> {
    let p = Path::new(&file_path);
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(p, content)
        .map_err(|e| format!("Failed to save pipeline draft: {}", e))?;
    Ok(())
}

#[tauri::command]
fn rename_local_pipeline_draft(
    file_path: String,
    new_name: String,
) -> Result<ScannedPipelineYamlItem, String> {
    let old_p = Path::new(&file_path);
    if !old_p.is_file() {
        return Err("Target pipeline file does not exist".to_string());
    }

    let parent = old_p.parent().unwrap_or_else(|| Path::new("."));
    let slug: String = new_name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let clean_slug = slug.trim_matches('_');
    let file_slug = if clean_slug.is_empty() { "pipeline" } else { clean_slug };
    let new_file_name = format!("{}.pipeline.yaml", file_slug);
    let new_p = parent.join(&new_file_name);

    let content = std::fs::read_to_string(old_p)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let updated_content = if content.contains("name:") {
        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        for line in &mut lines {
            if line.trim_start().starts_with("name:") {
                *line = format!("name: \"{}\"", new_name);
                break;
            }
        }
        lines.join("\n") + "\n"
    } else {
        format!("name: \"{}\"\n{}", new_name, content)
    };

    if new_p != old_p {
        std::fs::remove_file(old_p).map_err(|e| format!("Failed to remove old file: {}", e))?;
    }
    std::fs::write(&new_p, &updated_content)
        .map_err(|e| format!("Failed to write renamed pipeline: {}", e))?;

    let last_modified_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(ScannedPipelineYamlItem {
        file_name: new_file_name,
        relative_path: file_slug.to_string(),
        full_path: new_p.to_string_lossy().replace('\\', "/"),
        content: updated_content,
        last_modified_ms,
    })
}

#[tauri::command]
fn duplicate_local_pipeline_draft(file_path: String) -> Result<ScannedPipelineYamlItem, String> {
    let p = Path::new(&file_path);
    if !p.is_file() {
        return Err("Target pipeline file does not exist".to_string());
    }

    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    let file_stem = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("pipeline")
        .trim_end_matches(".pipeline.yaml")
        .trim_end_matches(".pipeline.yml");

    let dup_file_name = format!("{}_copy.pipeline.yaml", file_stem);
    let dup_p = parent.join(&dup_file_name);

    let content = std::fs::read_to_string(p)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let updated_content = if content.contains("name:") {
        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        for line in &mut lines {
            if line.trim_start().starts_with("name:") {
                let current_name = line.trim_start()["name:".len()..].trim().trim_matches('"');
                *line = format!("name: \"{} (Copy)\"", current_name);
                break;
            }
        }
        lines.join("\n") + "\n"
    } else {
        format!("name: \"Pipeline Copy\"\n{}", content)
    };

    std::fs::write(&dup_p, &updated_content)
        .map_err(|e| format!("Failed to duplicate pipeline: {}", e))?;

    let last_modified_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(ScannedPipelineYamlItem {
        file_name: dup_file_name,
        relative_path: format!("{}_copy", file_stem),
        full_path: dup_p.to_string_lossy().replace('\\', "/"),
        content: updated_content,
        last_modified_ms,
    })
}

#[tauri::command]
fn save_local_pipeline_snapshot(
    root_path: String,
    pipeline_slug: String,
    snapshot_json: String,
) -> Result<(), String> {
    let snaps_dir = Path::new(&root_path).join(".forgity").join("snapshots");
    std::fs::create_dir_all(&snaps_dir)
        .map_err(|e| format!("Failed to create .forgity/snapshots directory: {}", e))?;

    let snap_file = snaps_dir.join(format!("{}.snap.json", pipeline_slug));
    std::fs::write(snap_file, snapshot_json)
        .map_err(|e| format!("Failed to write snapshot json: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_local_pipeline_snapshot(
    root_path: String,
    pipeline_slug: String,
) -> Result<Option<String>, String> {
    let snap_file = Path::new(&root_path)
        .join(".forgity")
        .join("snapshots")
        .join(format!("{}.snap.json", pipeline_slug));

    if !snap_file.is_file() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(snap_file)
        .map_err(|e| format!("Failed to read snapshot json: {}", e))?;
    Ok(Some(content))
}

#[tauri::command]
fn delete_local_pipeline_draft(file_path: String) -> Result<(), String> {
    let p = Path::new(&file_path);
    if p.is_file() {
        std::fs::remove_file(p).map_err(|e| format!("Failed to delete pipeline: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn scan_local_script_folders(folders: Vec<ScriptFolderInput>) -> Vec<ScannedScriptItem> {
    let mut results = Vec::new();
    for folder in folders {
        let folder_path = Path::new(&folder.path);
        if folder_path.is_dir() {
            scan_dir_recursive(folder_path, folder_path, &mut results);
        }
    }
    results
}

fn scan_yaml_recursive(root_path: &Path, current_path: &Path, results: &mut Vec<ScannedPipelineYamlItem>) {
    let entries = match std::fs::read_dir(current_path) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if dir_name != "__pycache__" && dir_name != ".git" && dir_name != "node_modules" {
                scan_yaml_recursive(root_path, &path, results);
            }
        } else if path.is_file() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_pipeline_yaml = file_name.ends_with(".pipeline.yaml") || file_name.ends_with(".pipeline.yml");
            if !is_pipeline_yaml {
                continue;
            }

            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let relative = match path.strip_prefix(root_path) {
                Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
                Err(_) => file_name.clone(),
            };

            let last_modified_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            results.push(ScannedPipelineYamlItem {
                file_name,
                relative_path: relative,
                full_path: path.to_string_lossy().replace('\\', "/"),
                content,
                last_modified_ms,
            });
        }
    }
}

#[tauri::command]
fn scan_local_pipeline_drafts(folder_path: String) -> Vec<ScannedPipelineYamlItem> {
    let mut results = Vec::new();
    let root = Path::new(&folder_path);
    if root.is_dir() {
        scan_yaml_recursive(root, root, &mut results);
    }
    results
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinDefinitionDto {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub primitive_type: String,
    pub cardinality: String,
    pub is_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub struct_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDependencyDto {
    pub module: String,
    pub package_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzedLocalScriptItem {
    pub key: String,
    pub file_name: String,
    pub full_path: String,
    pub folder_root: String,
    pub namespace: String,
    pub relative_path: String,
    pub suggested_name: String,
    pub suggested_label: String,
    pub executor: String,
    pub description: Option<String>,
    pub content_hash: String,
    pub source_code: String,
    pub inputs: Vec<PinDefinitionDto>,
    pub outputs: Vec<PinDefinitionDto>,
    pub dependencies: Vec<ScriptDependencyDto>,
    pub last_modified_ms: u64,
}

fn to_label(s: &str) -> String {
    let mut result = String::new();
    let mut capitalize_next = true;
    for c in s.chars() {
        if c == '_' || c == '-' {
            result.push(' ');
            capitalize_next = true;
        } else if capitalize_next {
            result.extend(c.to_uppercase());
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }
    result
}

fn map_raw_pin(raw: &serde_json::Value, is_input: bool) -> PinDefinitionDto {
    let name = raw.get("name").and_then(|v| v.as_str()).unwrap_or("pin").to_string();
    let raw_label = raw.get("label").and_then(|v| v.as_str());
    let label = match raw_label {
        Some(l) if !l.trim().is_empty() => l.to_string(),
        _ => to_label(&name),
    };

    let data_type = raw.get("dataType").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
    let mut primitive_type = match data_type.as_str() {
        "number" | "int" | "float" => "Number",
        "bool" | "boolean" => "Boolean",
        "asset" | "file" => "Asset",
        "entityref" => "EntityRef",
        _ => "String",
    };

    let name_lower = name.to_lowercase();
    if is_input && primitive_type == "String" && (
        name_lower.contains("preset") ||
        name_lower.ends_with("_file") ||
        name_lower.ends_with("_asset")
    ) {
        primitive_type = "Asset";
    }

    let raw_cardinality = raw.get("cardinality").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
    let cardinality = match raw_cardinality.as_str() {
        "array" | "list" => "Array",
        "map" | "dict" => "Map",
        _ => "Single",
    };

    let raw_meta = raw.get("metadata").and_then(|v| v.as_str());
    let options = raw.get("options");
    let metadata = match raw_meta {
        Some(m) if !m.trim().is_empty() => Some(m.to_string()),
        _ => {
            if let Some(opts) = options {
                if opts.is_array() && !opts.as_array().unwrap().is_empty() {
                    Some(serde_json::json!({
                        "type": "select",
                        "options": opts
                    }).to_string())
                } else if primitive_type == "Asset" {
                    if name_lower.contains("preset") {
                        Some(serde_json::json!({ "type": "file", "accept": ".py" }).to_string())
                    } else {
                        Some(serde_json::json!({ "type": "file" }).to_string())
                    }
                } else {
                    None
                }
            } else if primitive_type == "Asset" {
                if name_lower.contains("preset") {
                    Some(serde_json::json!({ "type": "file", "accept": ".py" }).to_string())
                } else {
                    Some(serde_json::json!({ "type": "file" }).to_string())
                }
            } else {
                None
            }
        }
    };

    let is_required = is_input && raw.get("required").and_then(|v| v.as_bool()).unwrap_or(false);
    let default_value = raw.get("defaultValue").cloned().filter(|v| !v.is_null());
    let description = raw.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());

    PinDefinitionDto {
        id: name,
        label,
        kind: "Data".to_string(),
        primitive_type: primitive_type.to_string(),
        cardinality: cardinality.to_string(),
        is_required,
        default_value,
        metadata,
        struct_type: None,
        description,
    }
}

fn find_analyzer_script_path() -> Option<PathBuf> {
    if let Ok(env_path) = std::env::var("FORGITY_ANALYZER_PATH") {
        let p = PathBuf::from(env_path);
        if p.exists() {
            return Some(p);
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("resources").join("script-analyzer").join("analyzers").join("__main__.py"),
                exe_dir.join("script-analyzer").join("analyzers").join("__main__.py"),
                exe_dir.join("..").join("resources").join("script-analyzer").join("analyzers").join("__main__.py"),
            ];
            for c in &candidates {
                if c.exists() {
                    return Some(c.clone());
                }
            }
        }
    }

    if let Ok(mut current) = std::env::current_dir() {
        for _ in 0..6 {
            let p1 = current.join("packages").join("script-analyzer").join("analyzers").join("__main__.py");
            if p1.exists() {
                return Some(p1);
            }
            let p2 = current.join("api").join("lib").join("analyzers").join("__main__.py");
            if p2.exists() {
                return Some(p2);
            }
            if !current.pop() {
                break;
            }
        }
    }

    None
}

fn find_python_executable() -> String {
    if let Ok(p) = std::env::var("FORGITY_PYTHON") {
        if !p.is_empty() { return p; }
    }
    if let Ok(p) = std::env::var("PYTHON_PATH") {
        if !p.is_empty() { return p; }
    }

    #[cfg(target_os = "windows")]
    {
        for cmd in &["python", "py", "python3"] {
            let mut c = std::process::Command::new(cmd);
            c.creation_flags(0x08000000);
            if c.arg("--version").output().is_ok() {
                return cmd.to_string();
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for cmd in &["python3", "python"] {
            if std::process::Command::new(cmd).arg("--version").output().is_ok() {
                return cmd.to_string();
            }
        }
    }

    "python".to_string()
}

#[tauri::command]
fn analyze_local_scripts_native(folders: Vec<ScriptFolderInput>) -> Result<Vec<AnalyzedLocalScriptItem>, String> {
    let scanned_items = scan_local_script_folders(folders);
    if scanned_items.is_empty() {
        return Ok(Vec::new());
    }

    let analyzer_path = find_analyzer_script_path()
        .ok_or_else(|| "Could not locate script analyzer (__main__.py)".to_string())?;

    let python_cmd = find_python_executable();

    let batch_input: Vec<serde_json::Value> = scanned_items.iter().map(|item| {
        serde_json::json!({
            "key": item.key,
            "fileName": item.file_name,
            "path": item.full_path,
            "content": item.content,
        })
    }).collect();

    let input_bytes = serde_json::to_vec(&batch_input)
        .map_err(|e| format!("Failed to serialize batch input: {}", e))?;

    let mut command = std::process::Command::new(&python_cmd);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);

    let mut child = command
        .arg(&analyzer_path)
        .arg("--batch")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn python analyzer ({:?}): {}", python_cmd, e))?;

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin.write_all(&input_bytes)
            .map_err(|e| format!("Failed to write to python stdin: {}", e))?;
    }

    let output = child.wait_with_output()
        .map_err(|e| format!("Failed to wait for python analyzer: {}", e))?;

    if !output.status.success() {
        let err_str = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python analyzer error: {}", err_str));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let raw_results: Vec<serde_json::Value> = serde_json::from_str(&stdout_str)
        .map_err(|e| format!("Failed to parse analyzer JSON output: {}. Output was: {}", e, stdout_str))?;

    let raw_map: std::collections::HashMap<String, &serde_json::Value> = raw_results
        .iter()
        .filter_map(|r| r.get("key").and_then(|k| k.as_str()).map(|k| (k.to_string(), r)))
        .collect();

    let mut analyzed_items = Vec::new();
    for scanned in scanned_items {
        if let Some(raw) = raw_map.get(&scanned.key) {
            let suggested_name = raw.get("suggestedName")
                .and_then(|v| v.as_str())
                .unwrap_or_else(|| &scanned.file_name)
                .to_string();

            let suggested_label = raw.get("suggestedLabel")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| to_label(&suggested_name));

            let executor = raw.get("executor")
                .and_then(|v| v.as_str())
                .unwrap_or("python")
                .to_string();

            let description = raw.get("description")
                .or_else(|| raw.get("summary"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let inputs = raw.get("inputs")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().map(|p| map_raw_pin(p, true)).collect())
                .unwrap_or_default();

            let outputs = raw.get("outputs")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().map(|p| map_raw_pin(p, false)).collect())
                .unwrap_or_default();

            let dependencies = raw.get("dependencies")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter().map(|d| ScriptDependencyDto {
                        module: d.get("module").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        package_name: d.get("packageName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    }).collect()
                })
                .unwrap_or_default();

            analyzed_items.push(AnalyzedLocalScriptItem {
                key: scanned.key,
                file_name: scanned.file_name,
                full_path: scanned.full_path,
                folder_root: scanned.folder_root,
                namespace: scanned.namespace,
                relative_path: scanned.relative_path,
                suggested_name,
                suggested_label,
                executor,
                description,
                content_hash: scanned.content_hash,
                source_code: scanned.content,
                inputs,
                outputs,
                dependencies,
                last_modified_ms: scanned.last_modified_ms,
            });
        }
    }

    Ok(analyzed_items)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_local_machine_info,
            open_or_init_workspace_root,
            save_workspace_root_config,
            save_local_palette,
            load_local_palette,
            create_local_pipeline_draft,
            save_local_pipeline_draft,
            rename_local_pipeline_draft,
            duplicate_local_pipeline_draft,
            delete_local_pipeline_draft,
            save_local_pipeline_snapshot,
            load_local_pipeline_snapshot,
            scan_local_script_folders,
            scan_local_pipeline_drafts,
            analyze_local_scripts_native
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
