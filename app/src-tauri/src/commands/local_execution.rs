use forgity_core::bundle::build_execution_bundle;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Manages local `forgity-runner` execution processes.
#[derive(Default)]
pub struct LocalExecutionState {
    pub active_runs: Arc<Mutex<HashMap<String, Child>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRunStartedResponse {
    pub run_id: String,
    pub runner_path: String,
}

/// Resolves `forgity-runner` executable with priority:
/// 1. Custom environment variable FORGITY_RUNNER_BIN
/// 2. Monorepo dev workspace (`runner/target/debug` or `release`)
/// 3. Sibling binary next to the current Tauri executable (portable / bundled)
/// 4. Local AppData runner directory (`%LOCALAPPDATA%\Forgity\bin\forgity-runner.exe`)
/// 5. System PATH (`forgity-runner`)
pub fn resolve_runner_executable() -> Result<PathBuf, String> {
    let exe_name = if cfg!(windows) {
        "forgity-runner.exe"
    } else {
        "forgity-runner"
    };

    // 1. Check custom environment variable FORGITY_RUNNER_BIN
    if let Ok(custom_bin) = std::env::var("FORGITY_RUNNER_BIN") {
        let p = PathBuf::from(custom_bin);
        if p.is_file() {
            log::info!("Using runner from FORGITY_RUNNER_BIN: {:?}", p);
            return Ok(p);
        }
    }

    // 2. Dev mode / Monorepo workspace priority
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors() {
            let debug_bin = ancestor.join("runner").join("target").join("debug").join(exe_name);
            if debug_bin.is_file() {
                log::info!("Using dev debug runner from monorepo: {:?}", debug_bin);
                return Ok(debug_bin);
            }
            let release_bin = ancestor.join("runner").join("target").join("release").join(exe_name);
            if release_bin.is_file() {
                log::info!("Using dev release runner from monorepo: {:?}", release_bin);
                return Ok(release_bin);
            }
        }
    }

    // 3. Sibling binary next to current executable (portable or Tauri sidecar)
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            for name in [exe_name, "forgity-runner-x86_64-pc-windows-msvc.exe"] {
                let sibling = dir.join(name);
                if sibling.is_file() {
                    return Ok(sibling);
                }
            }
        }
    }

    // 4. Local AppData runner directory
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let installed = Path::new(&local_app_data)
            .join("Forgity")
            .join("bin")
            .join(exe_name);
        if installed.is_file() {
            return Ok(installed);
        }
    }

    // 5. Fallback to PATH
    Ok(PathBuf::from(exe_name))
}

/// Export ExecutionBundle v2 to JSON for debugging CLI with `forgity-runner run-bundle --bundle <file>`.
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

/// Build ExecutionBundle v2 JSON in memory for Cloud Publish (includes rootPipeline, components, scripts, constants).
#[tauri::command]
pub fn build_publish_bundle_json(
    root_path: String,
    pipeline_yaml_content: String,
    pipeline_kind: String,
) -> Result<Value, String> {
    let root = Path::new(&root_path);
    let bundle = build_execution_bundle(
        root,
        "publish_preview",
        &pipeline_yaml_content,
        &pipeline_kind,
        HashMap::new(),
    )?;
    serde_json::to_value(&bundle)
        .map_err(|e| format!("Failed to serialize ExecutionBundle: {}", e))
}

#[tauri::command]
pub fn run_cloud_bundle(
    app: AppHandle,
    state: State<'_, LocalExecutionState>,
    bundle_json: String,
    run_id: Option<String>,
) -> Result<LocalRunStartedResponse, String> {
    let eff_run_id = run_id.unwrap_or_else(|| {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        format!("cloud_{}", now_ms)
    });

    let runner_bin = resolve_runner_executable()?;
    let runner_path_str = runner_bin.to_string_lossy().to_string();
    log::info!("Spawning local forgity-runner binary: {}", runner_path_str);

    let default_api = std::env::var("FORGITY_API_URL")
        .unwrap_or_else(|_| "http://localhost:5189".to_string());

    let mut cmd = Command::new(&runner_bin);
    cmd.arg("run-bundle")
        .arg("--stdin")
        .arg("--json-events")
        .arg("--run-id")
        .arg(&eff_run_id)
        .env("FORGITY_API_URL", default_api)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn forgity-runner: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(bundle_json.as_bytes());
        let _ = stdin.flush();
    }

    let stderr = child.stderr.take();
    let stdout = child.stdout.take();
    let app_clone = app.clone();
    let run_id_clone = eff_run_id.clone();

    if let Ok(mut map) = state.active_runs.lock() {
        map.insert(eff_run_id.clone(), child);
    }

    if let Some(err_pipe) = stderr {
        let app_err = app.clone();
        let run_id_err = eff_run_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(err_pipe);
            for line in reader.lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    let _ = app_err.emit(
                        "local-pipeline://log",
                        serde_json::json!({ "runId": run_id_err, "line": line }),
                    );
                }
            }
        });
    }

    let active_runs_ref = state.active_runs.clone();
    std::thread::spawn(move || {
        let mut saw_run_completed = false;
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                    if val.get("type").and_then(|t| t.as_str()) == Some("run_completed") {
                        saw_run_completed = true;
                    }
                    let _ = app_clone.emit("local-pipeline://event", val);
                }
            }
        }
        if let Ok(mut map) = active_runs_ref.lock() {
            if let Some(mut c) = map.remove(&run_id_clone) {
                let _ = c.wait();
            }
        }
        if !saw_run_completed {
            let _ = app_clone.emit(
                "local-pipeline://event",
                serde_json::json!({
                    "type": "run_completed",
                    "run_id": run_id_clone,
                    "pipeline_id": "cloud_bundle",
                    "succeeded": false,
                    "error_message": "Runner process exited without emitting run_completed.",
                    "duration_ms": 0
                }),
            );
        }
    });

    Ok(LocalRunStartedResponse {
        run_id: eff_run_id,
        runner_path: runner_path_str,
    })
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
    log::info!("Spawning local forgity-runner binary: {}", runner_path_str);

    let default_api = std::env::var("FORGITY_API_URL")
        .unwrap_or_else(|_| "http://localhost:5189".to_string());

    let mut cmd = Command::new(&runner_bin);
    cmd.arg("run-bundle")
        .arg("--stdin")
        .arg("--json-events")
        .arg("--run-id")
        .arg(&run_id)
        .current_dir(&root_path)
        .env("FORGITY_API_URL", default_api)
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

    // BÆ¡m ExecutionBundle JSON vÃ o stdin rá»“i Ä‘Ã³ng á»‘ng ngay Ä‘á»ƒ Runner báº¯t Ä‘áº§u cháº¡y
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

    // Luá»“ng Ä‘á»c stderr Ä‘á»ƒ ghi nháº­n lá»—i ká»¹ thuáº­t náº¿u process cháº¿t báº¥t thÆ°á»ng
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

    // Luá»“ng Ä‘á»c stdout tá»«ng dÃ²ng JSON-lines vÃ  báº¯n sá»± kiá»‡n sang React Canvas
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

        // Chá» child káº¿t thÃºc vÃ  dá»n khá»i active_runs
        let exit_status = {
            if let Ok(mut map) = active_runs_ref.lock() {
                map.remove(&run_id_out).and_then(|mut c| c.wait().ok())
            } else {
                None
            }
        };

        // Náº¿u process cháº¿t báº¥t thÆ°á»ng mÃ  chÆ°a phÃ¡t `run_completed`, tá»± phÃ¡t sá»± kiá»‡n lá»—i Ä‘á»ƒ UI khÃ´ng bá»‹ treo
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
