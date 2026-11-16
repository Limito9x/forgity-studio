use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

use super::workspace_db::WorkspaceDb;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Quản lý các tiến trình `forgity-runner` đang chạy ở chế độ Local.
#[derive(Default)]
pub struct LocalExecutionState {
    pub active_runs: Arc<Mutex<HashMap<String, Child>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedScriptBundleDto {
    key: String,
    executor: String,
    full_path: String,
    requirements: Vec<String>,
    default_inputs: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRunStartedResponse {
    pub run_id: String,
    pub runner_path: String,
}

/// Tìm binary `forgity-runner.exe` theo thứ tự ưu tiên:
/// 1. Cạnh file exe Tauri hiện tại
/// 2. `%LOCALAPPDATA%\Forgity\bin\forgity-runner.exe`
/// 3. Build dev trong monorepo (`runner/target/debug` hoặc `release`)
/// 4. Biến môi trường PATH (`forgity-runner`)
pub fn resolve_runner_executable() -> Result<PathBuf, String> {
    let exe_name = if cfg!(windows) {
        "forgity-runner.exe"
    } else {
        "forgity-runner"
    };

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            let sibling = dir.join(exe_name);
            if sibling.is_file() {
                return Ok(sibling);
            }
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let installed = Path::new(&local_app_data)
            .join("Forgity")
            .join("bin")
            .join(exe_name);
        if installed.is_file() {
            return Ok(installed);
        }
    }

    // Dev fallback inside monorepo
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors() {
            let debug_bin = ancestor.join("runner").join("target").join("debug").join(exe_name);
            if debug_bin.is_file() {
                return Ok(debug_bin);
            }
            let release_bin = ancestor.join("runner").join("target").join("release").join(exe_name);
            if release_bin.is_file() {
                return Ok(release_bin);
            }
        }
    }

    // Fallback to PATH
    Ok(PathBuf::from(exe_name))
}

/// Đọc `.forgity/workspace.db` (nếu có) và đóng gói thành `ExecutionBundle` JSON DTO.
fn build_execution_bundle(
    root_path: &Path,
    run_id: &str,
    pipeline_yaml_content: &str,
    pipeline_kind: &str,
    mut runtime_inputs: HashMap<String, Value>,
) -> Result<Value, String> {
    let mut root_pipeline: Value = serde_yaml::from_str(pipeline_yaml_content)
        .map_err(|e| format!("Failed to parse pipeline YAML: {}", e))?;

    let mut scripts_map: HashMap<String, ResolvedScriptBundleDto> = HashMap::new();
    let mut components_map: HashMap<String, Value> = HashMap::new();
    let mut constants_map: HashMap<String, super::node_contracts::ResolvedConstantSpec> = HashMap::new();
    let mut raw_constants: Vec<super::node_contracts::RawConstantItem> = Vec::new();

    let db_file = root_path.join(".forgity").join("workspace.db");
    let db_opt = if db_file.is_file() {
        WorkspaceDb::open(root_path).ok()
    } else {
        None
    };
    if let Some(ref db) = db_opt {
        {
            // 1. Load scripts (palette_json is a JSON object { key: scriptObj } from WorkspaceDb, or an array)
            if let Ok(palette_json) = db.load_palette_json() {
                if let Ok(parsed_palette) = serde_json::from_str::<Value>(&palette_json) {
                    let entries: Vec<(Option<String>, Value)> = match parsed_palette {
                        Value::Object(map) => map.into_iter().map(|(k, v)| (Some(k), v)).collect(),
                        Value::Array(arr) => arr.into_iter().map(|v| (None, v)).collect(),
                        _ => Vec::new(),
                    };

                    for (map_key, item) in entries {
                        let key = item
                            .get("key")
                            .and_then(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string())
                            .or(map_key)
                            .unwrap_or_default();
                        if key.is_empty() {
                            continue;
                        }
                        let full_path = item
                            .get("fullPath")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string();
                        let executor = item
                            .get("executor")
                            .and_then(|v| v.as_str())
                            .unwrap_or("python")
                            .to_string();

                        let mut default_inputs = HashMap::new();
                        if let Some(inputs) = item.get("inputs").and_then(|v| v.as_array()) {
                            for pin in inputs {
                                if let (Some(pid), Some(def_val)) = (
                                    pin.get("id").and_then(|v| v.as_str()),
                                    pin.get("defaultValue"),
                                ) {
                                    if !def_val.is_null() {
                                        default_inputs.insert(pid.to_string(), def_val.clone());
                                    }
                                }
                            }
                        }

                        let mut requirements = Vec::new();
                        if let Some(deps) = item.get("dependencies").and_then(|v| v.as_array()) {
                            for dep in deps {
                                let pkg = dep
                                    .get("packageName")
                                    .and_then(|v| v.as_str())
                                    .filter(|s| !s.is_empty())
                                    .or_else(|| {
                                        dep.get("module")
                                            .and_then(|v| v.as_str())
                                            .filter(|s| !s.is_empty())
                                    });
                                if let Some(p) = pkg {
                                    requirements.push(p.to_string());
                                }
                            }
                        }

                        scripts_map.insert(
                            key.clone(),
                            ResolvedScriptBundleDto {
                                key,
                                executor,
                                full_path,
                                requirements,
                                default_inputs,
                            },
                        );
                    }
                }
            }

            // 2. Load & compile constants via SSOT node_contracts
            if let Ok(const_items) = super::node_contracts::load_constant_items_from_db(&db) {
                constants_map = super::node_contracts::compile_constant_specs(&const_items);
                raw_constants = const_items;
            }

        }
    }

    // 3. Load component YAMLs (disk scan + workspace.db merge via SSOT discover_component_pipelines)
    for (slug, full_path, relative_path) in
        super::node_contracts::discover_component_pipelines(root_path, db_opt.as_ref())
    {
        let p_path = PathBuf::from(&full_path);
        let resolved = if p_path.is_file() {
            p_path
        } else {
            root_path.join(&relative_path)
        };
        if let Ok(yaml_str) = std::fs::read_to_string(&resolved) {
            if let Ok(parsed_comp) = serde_yaml::from_str::<Value>(&yaml_str) {
                components_map.insert(slug, parsed_comp);
            }
        }
    }

    // 4. Expand ${VAR} trong toàn bộ node inputs, script defaultInputs & runtimeInputs
    if !raw_constants.is_empty() {
        super::node_contracts::expand_vars_in_dag_json(&mut root_pipeline, &raw_constants);
        for comp_doc in components_map.values_mut() {
            super::node_contracts::expand_vars_in_dag_json(comp_doc, &raw_constants);
        }
        for script_dto in scripts_map.values_mut() {
            for val in script_dto.default_inputs.values_mut() {
                super::node_contracts::expand_vars_in_json_value(val, &raw_constants);
            }
        }
        for val in runtime_inputs.values_mut() {
            super::node_contracts::expand_vars_in_json_value(val, &raw_constants);
        }
    }

    Ok(serde_json::json!({
        "bundleVersion": 2,
        "runId": run_id,
        "pipelineKind": pipeline_kind,
        "rootPipeline": root_pipeline,
        "runtimeInputs": runtime_inputs,
        "scripts": scripts_map,
        "components": components_map,
        "constants": constants_map,
    }))
}

/// Xuất ExecutionBundle v2 ra file JSON để chạy CLI debug `forgity-runner run-bundle --bundle <file>`.
#[tauri::command]
pub fn export_execution_bundle(
    root_path: String,
    pipeline_yaml_content: String,
    pipeline_kind: String,
    runtime_inputs: Option<HashMap<String, Value>>,
    output_path: Option<String>,
) -> Result<String, String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let run_id = format!("export_{}", now_ms);
    let root = Path::new(&root_path);

    let bundle = build_execution_bundle(
        root,
        &run_id,
        &pipeline_yaml_content,
        &pipeline_kind,
        runtime_inputs.unwrap_or_default(),
    )?;

    let target_path = match output_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => root
            .join(".forgity")
            .join("bundles")
            .join(format!("{}.json", run_id)),
    };

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create bundle directory: {}", e))?;
    }

    let pretty = serde_json::to_string_pretty(&bundle)
        .map_err(|e| format!("Failed to serialize ExecutionBundle: {}", e))?;
    std::fs::write(&target_path, pretty)
        .map_err(|e| format!("Failed to write ExecutionBundle file: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn run_local_pipeline(
    app: AppHandle,
    state: State<'_, LocalExecutionState>,
    root_path: String,
    pipeline_yaml_content: String,
    pipeline_kind: String,
    runtime_inputs: Option<HashMap<String, Value>>,
) -> Result<LocalRunStartedResponse, String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let run_id = format!("local_{}", now_ms);

    let bundle = build_execution_bundle(
        Path::new(&root_path),
        &run_id,
        &pipeline_yaml_content,
        &pipeline_kind,
        runtime_inputs.unwrap_or_default(),
    )?;
    let bundle_json = serde_json::to_string(&bundle)
        .map_err(|e| format!("Failed to serialize ExecutionBundle: {}", e))?;

    let runner_bin = resolve_runner_executable()?;
    let runner_path_str = runner_bin.to_string_lossy().to_string();

    let mut cmd = Command::new(&runner_bin);
    cmd.arg("run-bundle")
        .arg("--stdin")
        .arg("--json-events")
        .arg("--run-id")
        .arg(&run_id)
        .current_dir(&root_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn forgity-runner at '{}': {}. Make sure forgity-runner is built or installed via `forgity-runner setup`.",
            runner_path_str, e
        )
    })?;

    // Bơm ExecutionBundle JSON vào stdin rồi đóng ống ngay để Runner bắt đầu chạy
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(bundle_json.as_bytes())
            .map_err(|e| format!("Failed to write ExecutionBundle to runner stdin: {}", e))?;
        let _ = stdin.flush();
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture runner stdout".to_string())?;
    let stderr = child.stderr.take();

    {
        let mut map = state
            .active_runs
            .lock()
            .map_err(|_| "LocalExecutionState lock poisoned".to_string())?;
        map.insert(run_id.clone(), child);
    }

    // Luồng đọc stderr để ghi nhận lỗi kỹ thuật nếu process chết bất thường
    let stderr_buf = Arc::new(Mutex::new(Vec::<String>::new()));
    if let Some(stderr_pipe) = stderr {
        let stderr_buf_clone = stderr_buf.clone();
        let app_err = app.clone();
        let run_id_err = run_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr_pipe);
            for line in reader.lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    if let Ok(mut buf) = stderr_buf_clone.lock() {
                        if buf.len() > 200 {
                            buf.remove(0);
                        }
                        buf.push(line.clone());
                    }
                    let _ = app_err.emit(
                        "local-pipeline://log",
                        serde_json::json!({
                            "runId": run_id_err,
                            "line": line,
                        }),
                    );
                }
            }
        });
    }

    // Luồng đọc stdout từng dòng JSON-lines và bắn sự kiện sang React Canvas
    let active_runs_ref = state.active_runs.clone();
    let run_id_out = run_id.clone();
    let app_out = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut saw_run_completed = false;

        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
                if parsed.get("type").and_then(|t| t.as_str()) == Some("run_completed") {
                    saw_run_completed = true;
                }
                let _ = app_out.emit("local-pipeline://event", parsed);
            }
        }

        // Chờ child kết thúc và dọn khỏi active_runs
        let exit_status = {
            if let Ok(mut map) = active_runs_ref.lock() {
                map.remove(&run_id_out).and_then(|mut c| c.wait().ok())
            } else {
                None
            }
        };

        // Nếu process chết bất thường mà chưa phát `run_completed`, tự phát sự kiện lỗi để UI không bị treo
        if !saw_run_completed {
            let err_summary = stderr_buf
                .lock()
                .ok()
                .and_then(|b| {
                    if b.is_empty() {
                        None
                    } else {
                        Some(b.join("\n"))
                    }
                })
                .unwrap_or_else(|| match exit_status {
                    Some(st) => format!("Runner exited unexpectedly with status: {}", st),
                    None => "Runner process terminated unexpectedly".to_string(),
                });

            let _ = app_out.emit(
                "local-pipeline://event",
                serde_json::json!({
                    "type": "run_completed",
                    "run_id": run_id_out,
                    "pipeline_id": "",
                    "succeeded": false,
                    "outputs": null,
                    "error_message": err_summary,
                    "duration_ms": 0,
                }),
            );
        }
    });

    Ok(LocalRunStartedResponse {
        run_id,
        runner_path: runner_path_str,
    })
}

#[tauri::command]
pub fn cancel_local_pipeline(
    app: AppHandle,
    state: State<'_, LocalExecutionState>,
    run_id: String,
) -> Result<(), String> {
    let child_opt = {
        let mut map = state
            .active_runs
            .lock()
            .map_err(|_| "LocalExecutionState lock poisoned".to_string())?;
        map.remove(&run_id)
    };

    if let Some(mut child) = child_opt {
        let _ = child.kill();
        let _ = child.wait();
        let _ = app.emit(
            "local-pipeline://event",
            serde_json::json!({
                "type": "run_completed",
                "run_id": run_id,
                "pipeline_id": "",
                "succeeded": false,
                "outputs": null,
                "error_message": "Cancelled by user",
                "duration_ms": 0,
            }),
        );
    }

    Ok(())
}
