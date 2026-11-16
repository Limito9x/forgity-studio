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

/// Quáº£n lÃ½ cÃ¡c tiáº¿n trÃ¬nh `forgity-runner` Ä‘ang cháº¡y á»Ÿ cháº¿ Ä‘á»™ Local.
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

/// TÃ¬m binary `forgity-runner.exe` theo thá»© tá»± Æ°u tiÃªn:
/// 1. Cáº¡nh file exe Tauri hiá»‡n táº¡i
/// 2. `%LOCALAPPDATA%\Forgity\bin\forgity-runner.exe`
/// 3. Build dev trong monorepo (`runner/target/debug` hoáº·c `release`)
/// 4. Biáº¿n mÃ´i trÆ°á»ng PATH (`forgity-runner`)
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

/// Xuáº¥t ExecutionBundle v2 ra file JSON Ä‘á»ƒ cháº¡y CLI debug `forgity-runner run-bundle --bundle <file>`.
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
