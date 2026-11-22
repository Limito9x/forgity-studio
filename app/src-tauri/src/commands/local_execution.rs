use forgity_core::bundle::build_execution_bundle;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct RunnerWorkerHandle {
    pub child: Child,
    pub stdin: ChildStdin,
    pub runner_path: String,
}

/// Manages persistent `forgity-runner worker` sidecar process (keeps DccPool / Unreal warm).
#[derive(Default)]
pub struct LocalExecutionState {
    pub worker: Arc<Mutex<Option<RunnerWorkerHandle>>>,
    pub current_run_id: Arc<Mutex<Option<String>>>,
    pub current_run_context: Arc<Mutex<Option<(String, PathBuf, i64)>>>,
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

    // 2. Dev mode / Monorepo workspace priority (only in debug builds so release/installed builds use their bundled sidecar)
    #[cfg(debug_assertions)]
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors() {
            let root_debug_bin = ancestor.join("target").join("debug").join(exe_name);
            if root_debug_bin.is_file() {
                log::info!("Using dev debug runner from workspace root: {:?}", root_debug_bin);
                return Ok(root_debug_bin);
            }
            let root_release_bin = ancestor.join("target").join("release").join(exe_name);
            if root_release_bin.is_file() {
                log::info!("Using dev release runner from workspace root: {:?}", root_release_bin);
                return Ok(root_release_bin);
            }
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

pub fn resolve_default_api_url() -> String {
    std::env::var("FORGITY_API_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| option_env!("FORGITY_API_URL").map(String::from))
        .or_else(|| option_env!("VITE_API_URL").map(String::from))
        .unwrap_or_else(|| "http://localhost:5189".to_string())
}

fn send_worker_command(
    app: &AppHandle,
    state: &LocalExecutionState,
    cmd_payload: &Value,
) -> Result<String, String> {
    let mut guard = state
        .worker
        .lock()
        .map_err(|_| "LocalExecutionState lock poisoned".to_string())?;

    let needs_spawn = match guard.as_mut() {
        Some(handle) => match handle.child.try_wait() {
            Ok(Some(_)) | Err(_) => true,
            Ok(None) => false,
        },
        None => true,
    };

    if needs_spawn {
        let runner_bin = resolve_runner_executable()?;
        let runner_path_str = runner_bin.to_string_lossy().to_string();
        log::info!("Spawning persistent forgity-runner worker: {}", runner_path_str);

        let default_api = resolve_default_api_url();

        let worker_home = std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("Forgity");
        let _ = std::fs::create_dir_all(&worker_home);

        let mut cmd = Command::new(&runner_bin);
        cmd.arg("worker")
            .current_dir(&worker_home)
            .env("FORGITY_API_URL", default_api)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn().map_err(|e| {
            format!(
                "Failed to spawn forgity-runner worker at '{}': {}.",
                runner_path_str, e
            )
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture worker stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture worker stdout".to_string())?;
        let stderr = child.stderr.take();

        let stderr_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

        if let Some(err_pipe) = stderr {
            let app_err = app.clone();
            let current_run_ref = state.current_run_id.clone();
            let stderr_tail_err = stderr_tail.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(err_pipe);
                for line in reader.lines().map_while(Result::ok) {
                    if !line.trim().is_empty() {
                        if let Ok(mut tail) = stderr_tail_err.lock() {
                            tail.push(line.clone());
                            if tail.len() > 20 {
                                let excess = tail.len() - 20;
                                tail.drain(0..excess);
                            }
                        }
                        let rid = current_run_ref
                            .lock()
                            .ok()
                            .and_then(|g| g.clone())
                            .unwrap_or_else(|| "worker".to_string());
                        let _ = app_err.emit(
                            "local-pipeline://log",
                            serde_json::json!({ "runId": rid, "line": line }),
                        );
                    }
                }
            });
        }

        let app_out = app.clone();
        let run_ctx_ref = state.current_run_context.clone();
        let current_run_out = state.current_run_id.clone();
        let stderr_tail_out = stderr_tail.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
                    if parsed.get("type").and_then(|t| t.as_str()) == Some("dcc_sessions") {
                        let _ = app_out.emit("local-pipeline://dcc-sessions", parsed);
                    } else {
                        if parsed.get("type").and_then(|t| t.as_str()) == Some("run_completed") {
                            if let Ok(mut cur) = current_run_out.lock() {
                                if cur.as_deref() == parsed.get("run_id").and_then(|v| v.as_str()) {
                                    *cur = None;
                                }
                            }
                        }
                        // Persist execution timing & node metrics into .forgity/workspace.db
                        if let Ok(ctx_guard) = run_ctx_ref.lock() {
                            if let Some((ref tracked_run_id, ref root_path, run_started_ms)) = *ctx_guard {
                                let ev_run_id = parsed.get("run_id").and_then(|v| v.as_str()).unwrap_or("");
                                if ev_run_id == tracked_run_id {
                                    let now_ms = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .map(|d| d.as_millis() as i64)
                                        .unwrap_or(run_started_ms);
                                    if let Ok(db) = forgity_core::workspace_db::WorkspaceDb::open(root_path) {
                                        match parsed.get("type").and_then(|t| t.as_str()) {
                                            Some("run_started") => {
                                                let pid = parsed.get("pipeline_id").and_then(|v| v.as_str()).unwrap_or("unknown");
                                                let pkind = parsed.get("pipeline_kind").and_then(|v| v.as_str()).unwrap_or("master");
                                                let _ = db.insert_execution_run(tracked_run_id, pid, pkind, now_ms);
                                            }
                                            Some("node_started") => {
                                                if let Some(nid) = parsed.get("node_id").and_then(|v| v.as_str()) {
                                                    let ntype = parsed.get("node_type").and_then(|v| v.as_str()).unwrap_or("");
                                                    let label = parsed.get("label").and_then(|v| v.as_str());
                                                    let btotal = parsed.get("batch_total").and_then(|v| v.as_i64());
                                                    let offset = (now_ms - run_started_ms).max(0);
                                                    let _ = db.upsert_execution_node_start(tracked_run_id, nid, ntype, label, now_ms, offset, btotal);
                                                }
                                            }
                                            Some("node_progress") => {
                                                if let Some(nid) = parsed.get("node_id").and_then(|v| v.as_str()) {
                                                    let st = parsed.get("status").and_then(|v| v.as_str()).unwrap_or("running");
                                                    let comp = parsed.get("completed").and_then(|v| v.as_i64());
                                                    let tot = parsed.get("total").and_then(|v| v.as_i64());
                                                    let _ = db.update_execution_node_progress(tracked_run_id, nid, st, comp, tot);
                                                }
                                            }
                                            Some("node_completed") => {
                                                if let Some(nid) = parsed.get("node_id").and_then(|v| v.as_str()) {
                                                    let ok = parsed.get("succeeded").and_then(|v| v.as_bool()).unwrap_or(false);
                                                    let dur = parsed.get("duration_ms").and_then(|v| v.as_i64()).unwrap_or(0);
                                                    let err = parsed.get("error_message").and_then(|v| v.as_str());
                                                    let outs = parsed.get("outputs").map(|v| v.to_string());
                                                    let _ = db.complete_execution_node(tracked_run_id, nid, ok, now_ms, dur, err, outs.as_deref());
                                                }
                                            }
                                            Some("run_completed") => {
                                                let ok = parsed.get("succeeded").and_then(|v| v.as_bool()).unwrap_or(false);
                                                let dur = parsed.get("duration_ms").and_then(|v| v.as_i64()).unwrap_or(0);
                                                let err = parsed.get("error_message").and_then(|v| v.as_str());
                                                let outs = parsed.get("outputs").map(|v| v.to_string());
                                                let _ = db.complete_execution_run(tracked_run_id, ok, now_ms, dur, err, outs.as_deref());
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        }
                        let _ = app_out.emit("local-pipeline://event", parsed);
                    }
                }
            }

            // Worker stdout closed (process exited/crashed): if a run was active without run_completed, notify UI
            if let Ok(mut cur) = current_run_out.lock() {
                if let Some(pending_rid) = cur.take() {
                    let err_summary = stderr_tail_out
                        .lock()
                        .ok()
                        .map(|t| t.join("\n"))
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or_else(|| "Local runner worker exited unexpectedly.".to_string());
                    let _ = app_out.emit(
                        "local-pipeline://event",
                        serde_json::json!({
                            "type": "run_completed",
                            "run_id": pending_rid,
                            "pipeline_id": "",
                            "succeeded": false,
                            "error_message": err_summary,
                            "duration_ms": 0
                        }),
                    );
                }
            }
        });

        *guard = Some(RunnerWorkerHandle {
            child,
            stdin,
            runner_path: runner_path_str,
        });
    }

    let handle = guard.as_mut().unwrap();
    let line = serde_json::to_string(cmd_payload)
        .map_err(|e| format!("Failed to serialize worker command: {}", e))?;
    writeln!(handle.stdin, "{}", line)
        .and_then(|_| handle.stdin.flush())
        .map_err(|e| format!("Failed to write to forgity-runner worker stdin: {}", e))?;

    Ok(handle.runner_path.clone())
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

    let bundle_val: Value = serde_json::from_str(&bundle_json)
        .map_err(|e| format!("Invalid ExecutionBundle JSON: {}", e))?;

    if let Ok(mut cur) = state.current_run_id.lock() {
        *cur = Some(eff_run_id.clone());
    }

    let runner_path = send_worker_command(
        &app,
        &state,
        &serde_json::json!({
            "cmd": "run_bundle",
            "run_id": eff_run_id,
            "bundle": bundle_val,
        }),
    )?;

    Ok(LocalRunStartedResponse {
        run_id: eff_run_id,
        runner_path,
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
    let bundle_val = serde_json::to_value(&bundle)
        .map_err(|e| format!("Failed to serialize ExecutionBundle: {}", e))?;

    let mut uproject_path: Option<String> = None;
    {
        use tauri::Manager;
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            if let Ok(registry) = forgity_core::workspace_registry::WorkspaceRegistryDb::open(&app_data_dir) {
                let root_slash = root_path.replace('\\', "/");
                let root_backslash = root_path.replace('/', "\\");
                let ws_opt = registry.get_workspace_by_root_path(&root_path).ok().flatten()
                    .or_else(|| registry.get_workspace_by_root_path(&root_slash).ok().flatten())
                    .or_else(|| registry.get_workspace_by_root_path(&root_backslash).ok().flatten());
                if let Some(up) = ws_opt.and_then(|ws| ws.unreal_project_path) {
                    let trimmed = up.trim().to_string();
                    if !trimmed.is_empty() {
                        uproject_path = Some(trimmed);
                    }
                }
            }
        }
    }

    if let Ok(mut cur) = state.current_run_id.lock() {
        *cur = Some(run_id.clone());
    }
    if let Ok(mut ctx) = state.current_run_context.lock() {
        *ctx = Some((run_id.clone(), PathBuf::from(&root_path), now_ms as i64));
    }

    let runner_path = send_worker_command(
        &app,
        &state,
        &serde_json::json!({
            "cmd": "run_bundle",
            "run_id": run_id,
            "bundle": bundle_val,
            "uproject_path": uproject_path,
        }),
    )?;

    Ok(LocalRunStartedResponse {
        run_id,
        runner_path,
    })
}

#[tauri::command]
pub fn cancel_local_pipeline(
    app: AppHandle,
    state: State<'_, LocalExecutionState>,
    run_id: String,
) -> Result<(), String> {
    let _ = send_worker_command(
        &app,
        &state,
        &serde_json::json!({
            "cmd": "cancel_run",
            "run_id": run_id,
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn list_local_dcc_sessions(
    app: AppHandle,
    state: State<'_, LocalExecutionState>,
) -> Result<Vec<Value>, String> {
    let worker_alive = if let Ok(mut guard) = state.worker.lock() {
        match guard.as_mut() {
            Some(handle) => matches!(handle.child.try_wait(), Ok(None)),
            None => false,
        }
    } else {
        false
    };

    if !worker_alive {
        return Ok(Vec::new());
    }

    let _ = send_worker_command(
        &app,
        &state,
        &serde_json::json!({ "cmd": "list_dcc_sessions" }),
    );

    let data_dir = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("Forgity");
    let snapshot_file = data_dir.join("dcc-sessions.json");
    if !snapshot_file.is_file() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&snapshot_file).unwrap_or_default();
    let sessions: Vec<Value> = serde_json::from_str(&content).unwrap_or_default();
    Ok(sessions)
}

#[tauri::command]
pub fn stop_local_dcc_session(
    app: AppHandle,
    state: State<'_, LocalExecutionState>,
    key: Option<String>,
    all: Option<bool>,
) -> Result<(), String> {
    let _ = send_worker_command(
        &app,
        &state,
        &serde_json::json!({
            "cmd": "stop_dcc_session",
            "key": key,
            "all": all.unwrap_or(false),
        }),
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_local_execution_runs(
    root_path: String,
    pipeline_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<forgity_core::workspace_db::LocalExecutionRunRow>, String> {
    let db = forgity_core::workspace_db::WorkspaceDb::open(Path::new(&root_path))?;
    db.list_execution_runs(pipeline_id.as_deref(), limit.unwrap_or(30))
}

#[tauri::command]
pub fn get_local_execution_detail(
    root_path: String,
    run_id: String,
) -> Result<Option<forgity_core::workspace_db::LocalExecutionDetail>, String> {
    let db = forgity_core::workspace_db::WorkspaceDb::open(Path::new(&root_path))?;
    db.get_execution_detail(&run_id)
}

#[tauri::command]
pub fn delete_local_execution_history(
    root_path: String,
    run_id: Option<String>,
    pipeline_id: Option<String>,
) -> Result<(), String> {
    let db = forgity_core::workspace_db::WorkspaceDb::open(Path::new(&root_path))?;
    db.delete_execution_history(run_id.as_deref(), pipeline_id.as_deref())
}
