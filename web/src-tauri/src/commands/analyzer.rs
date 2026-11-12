use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
    pub key_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_type: Option<String>,
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
pub struct LocalStructFieldDto {
    pub name: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub cardinality: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub struct_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStructDefinitionDto {
    pub slug: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub fields: Vec<LocalStructFieldDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
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
    pub detected_structs: Vec<LocalStructDefinitionDto>,
    pub dependencies: Vec<ScriptDependencyDto>,
    pub last_modified_ms: u64,
}

fn is_hex_hash_stem(stem: &str) -> bool {
    if stem.len() < 32 {
        return false;
    }
    stem.chars().all(|c| c.is_ascii_hexdigit())
}

fn is_ignored_dir(name: &str, custom_ignores: &[String]) -> bool {
    if name.starts_with('.') {
        return true;
    }
    let lower = name.to_ascii_lowercase();

    // Check custom user ignore patterns from workspace config
    if custom_ignores.iter().any(|pattern| pattern.to_ascii_lowercase() == lower) {
        return true;
    }

    // Standard dev & build artifacts only
    matches!(
        lower.as_str(),
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
    custom_ignores: &[String],
) {
    let read_dir = match std::fs::read_dir(current_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if !is_ignored_dir(&file_name, custom_ignores) {
                scan_dir_recursive(root_path, &path, results, custom_ignores);
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

#[tauri::command]
pub fn scan_local_script_folders(
    folders: Vec<ScriptFolderInput>,
    custom_ignores: Option<Vec<String>>,
) -> Vec<ScannedScriptItem> {
    let ignores = custom_ignores.unwrap_or_default();
    let mut results = Vec::new();
    for folder in folders {
        let folder_path = Path::new(&folder.path);
        if folder_path.is_dir() {
            scan_dir_recursive(folder_path, folder_path, &mut results, &ignores);
        }
    }
    results
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
    let struct_type = raw.get("structType").and_then(|v| v.as_str()).map(|s| s.to_string());

    let mut primitive_type = match data_type.as_str() {
        "number" | "int" | "float" => "Number",
        "bool" | "boolean" => "Boolean",
        "asset" | "file" => "Asset",
        "struct" => "Struct",
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

    let (key_type, value_type) = if cardinality == "Map" {
        let kt = raw.get("keyType").and_then(|v| v.as_str()).unwrap_or("Text").to_string();
        let vt = raw.get("valueType").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| {
            if name_lower.ends_with("_maps") || name_lower.ends_with("_paths") || name_lower.ends_with("_files") || name_lower.contains("texture") {
                "Asset".to_string()
            } else {
                "Text".to_string()
            }
        });
        (Some(kt), Some(vt))
    } else {
        (None, None)
    };

    PinDefinitionDto {
        id: name,
        label,
        kind: "Data".to_string(),
        primitive_type: primitive_type.to_string(),
        cardinality: cardinality.to_string(),
        is_required,
        default_value,
        metadata,
        struct_type,
        key_type,
        value_type,
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
pub fn analyze_local_scripts_native(
    folders: Vec<ScriptFolderInput>,
    custom_ignores: Option<Vec<String>>,
) -> Result<Vec<AnalyzedLocalScriptItem>, String> {
    let scanned_items = scan_local_script_folders(folders, custom_ignores);
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
    command.env("PYTHONIOENCODING", "utf-8");
    command.env("PYTHONUTF8", "1");

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

            let detected_structs: Vec<LocalStructDefinitionDto> = raw.get("detectedStructs")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter().filter_map(|s| {
                        let slug = s.get("slug")?.as_str()?.to_string();
                        let display_name = s.get("displayName")
                            .and_then(|v| v.as_str())
                            .unwrap_or(&slug)
                            .to_string();
                        let description = s.get("description")
                            .and_then(|v| v.as_str())
                            .map(|v| v.to_string());
                        let fields = s.get("fields")
                            .and_then(|v| v.as_array())
                            .map(|f_arr| {
                                f_arr.iter().filter_map(|f| {
                                    Some(LocalStructFieldDto {
                                        name: f.get("name")?.as_str()?.to_string(),
                                        label: f.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                        field_type: f.get("type").and_then(|v| v.as_str()).unwrap_or("String").to_string(),
                                        cardinality: f.get("cardinality").and_then(|v| v.as_str()).unwrap_or("Single").to_string(),
                                        struct_type: f.get("structType").and_then(|v| v.as_str()).map(|v| v.to_string()),
                                        default_value: f.get("defaultValue").cloned(),
                                        description: f.get("description").and_then(|v| v.as_str()).map(|v| v.to_string()),
                                    })
                                }).collect()
                            })
                            .unwrap_or_default();
                        Some(LocalStructDefinitionDto {
                            slug,
                            display_name,
                            description,
                            fields,
                            updated_at: None,
                        })
                    }).collect()
                })
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
                detected_structs,
                dependencies,
                last_modified_ms: scanned.last_modified_ms,
            });
        }
    }

    Ok(analyzed_items)
}

