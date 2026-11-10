use std::path::Path;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

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

fn is_ignored_dir_or_file(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    matches!(
        name,
        "__pycache__" | "venv" | ".venv" | "env" | "node_modules" | "target" | "bin" | "obj" | "dist" | "build"
    )
}

fn scan_dir_recursive(
    root_path: &Path,
    current_dir: &Path,
    namespace: &str,
    results: &mut Vec<ScannedScriptItem>,
) {
    let read_dir = match std::fs::read_dir(current_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if is_ignored_dir_or_file(&file_name) {
            continue;
        }

        if path.is_dir() {
            scan_dir_recursive(root_path, &path, namespace, results);
        } else if path.is_file() {
            let is_python = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("py"))
                .unwrap_or(false);

            if !is_python {
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

            let key = format!("{}:{}", namespace, relative_no_ext);

            let last_modified_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            results.push(ScannedScriptItem {
                namespace: namespace.to_string(),
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

#[tauri::command]
fn scan_local_script_folders(folders: Vec<ScriptFolderInput>) -> Vec<ScannedScriptItem> {
    let mut results = Vec::new();
    for folder in folders {
        let folder_path = Path::new(&folder.path);
        if folder_path.is_dir() {
            scan_dir_recursive(folder_path, folder_path, &folder.namespace, &mut results);
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
            scan_local_script_folders,
            scan_local_pipeline_drafts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
