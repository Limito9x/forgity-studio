use anyhow::{Context, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::{create_dir_all, remove_file, File};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use super::contracts::{StageResultMessage, StageTaskMessage, StepProgressMessage, StepResult};
use super::executors::{ExecutionContext, ExecutorRegistry};
use super::traits::EventSink;
use crate::ipc::pipe_server::PipeServer;
use crate::ipc::protocol::{GuestToHostMessage, HostToGuestMessage, HostToResidentMessage, ResidentToHostMessage};
use crate::process::active_stage::ActiveStageManager;
use crate::process::dcc_pool::DccPool;
use crate::process::job_object::JobObject;
use crate::process::subprocess::SubprocessRunner;
use crate::storage::cache::StorageManager;
use crate::storage::downloader::StreamDownloader;
use crate::system::dcc::resolve_executor_executable;

use std::collections::HashMap;
use std::time::Duration;

const EMBEDDED_GUEST_SCRIPT: &str = include_str!("../../scripts/stage_runner_guest.py");

/// Ensures that `stage_runner_guest.py` is present and returns its absolute path.
/// Searches in CWD, next to the runner executable, and falls back to writing the embedded script to %LOCALAPPDATA%/Forgity/scripts/.
pub fn ensure_guest_script() -> Result<PathBuf> {
    // 1. Check if scripts/stage_runner_guest.py exists in CWD
    let cwd_script = PathBuf::from("scripts").join("stage_runner_guest.py");
    if cwd_script.is_file() {
        if let Ok(canon) = std::fs::canonicalize(&cwd_script) {
            return Ok(canon);
        }
    }

    // 2. Check if scripts/stage_runner_guest.py exists next to current executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let exe_script = exe_dir.join("scripts").join("stage_runner_guest.py");
            if exe_script.is_file() {
                if let Ok(canon) = std::fs::canonicalize(&exe_script) {
                    return Ok(canon);
                }
            }
        }
    }

    // 3. Fallback: Write embedded script to %LOCALAPPDATA%/Forgity/scripts/stage_runner_guest.py
    let data_dir = crate::cli::daemon::get_daemon_data_dir();
    let target_dir = data_dir.join("scripts");
    let _ = std::fs::create_dir_all(&target_dir);
    let target_file = target_dir.join("stage_runner_guest.py");

    let _ = std::fs::write(&target_file, EMBEDDED_GUEST_SCRIPT);

    if let Ok(canon) = std::fs::canonicalize(&target_file) {
        Ok(canon)
    } else {
        Ok(target_file)
    }
}

pub struct StageDispatcher {
    event_sink: Arc<dyn EventSink>,
    storage: StorageManager,
    downloader: StreamDownloader,
    active_stages: Arc<ActiveStageManager>,
    dcc_pool: Arc<DccPool>,
    executor_registry: Arc<ExecutorRegistry>,
    custom_env: Option<HashMap<String, String>>,
}

impl StageDispatcher {
    pub fn new(
        event_sink: Arc<dyn EventSink>,
        active_stages: Arc<ActiveStageManager>,
        dcc_pool: Arc<DccPool>,
        custom_env: Option<HashMap<String, String>>,
    ) -> Self {
        let storage = StorageManager::new(None);
        let downloader = StreamDownloader::new(StorageManager::new(None));
        let executor_registry = Arc::new(ExecutorRegistry::new());
        Self {
            event_sink,
            storage,
            downloader,
            active_stages,
            dcc_pool,
            executor_registry,
            custom_env,
        }
    }

    /// Dispatches a single StageTaskMessage: acquires storage lock, resolves script caches,
    /// creates Job Object, opens IPC pipe, spawns DCC subprocess, streams progress and handles on-demand asset fetching.
    pub async fn dispatch_stage(&self, mut task: StageTaskMessage) -> Result<StageResultMessage> {
        let stage_id = task.stage_execution_id.clone();
        info!(
            "════════════════════════════════════════════════════════════════\n\
             [Dispatcher] Starting execution of Stage: {}\n\
             [Dispatcher] Pipeline: {} | Executor: {} | Steps: {}\n\
             ════════════════════════════════════════════════════════════════",
            stage_id, task.pipeline_execution_id, task.executor, task.steps.len()
        );

        // 1. Acquire Storage Lock
        // SQLite WAL in StorageManager handles concurrent cache access without a global lockfile.

        // 2. Resolve & pre-cache Script Nodes
        for step in &mut task.steps {
            if let Some(script_url) = &step.script_url {
                if !script_url.is_empty() {
                    let expected_hash = step.script_hash.as_deref();
                    info!(
                        "[Storage] Resolving script for step '{}' from URL (hash: {:?})...",
                        step.step_execution_id, expected_hash
                    );
                    match self
                        .downloader
                        .download_asset(script_url, expected_hash, Some("py"))
                        .await
                    {
                        Ok((script_path, computed_hash)) => {
                            let abs_path = crate::storage::cache::normalize_absolute_path(
                                std::fs::canonicalize(&script_path).unwrap_or(script_path),
                            );
                            info!(
                                "[Storage] Script cached at {:?} (hash: {})",
                                abs_path, computed_hash
                            );
                            step.script_path = abs_path.to_string_lossy().to_string();
                        }
                        Err(e) => {
                            warn!(
                                "[Storage] Could not pre-download script for step '{}': {}",
                                step.step_execution_id, e
                            );
                        }
                    }
                }
            }

            // 2b. Pre-resolve & pre-download any File Pins ($file or object with url) in step inputs
            for (key, val) in &mut step.inputs {
                let file_info = if let Some(obj) = val.as_object() {
                    if let Some(inner) = obj.get("$file").and_then(|v| v.as_object()) {
                        Some((
                            inner.get("url").and_then(|v| v.as_str()),
                            inner.get("hash").and_then(|v| v.as_str()),
                            inner.get("filename").or_else(|| inner.get("name")).and_then(|v| v.as_str()),
                        ))
                    } else if obj.contains_key("url") {
                        Some((
                            obj.get("url").and_then(|v| v.as_str()),
                            obj.get("hash").and_then(|v| v.as_str()),
                            obj.get("filename").or_else(|| obj.get("name")).and_then(|v| v.as_str()),
                        ))
                    } else {
                        None
                    }
                } else {
                    None
                };

                if let Some((Some(url), hash, filename)) = file_info {
                    let ext = filename
                        .and_then(|f| f.rsplit('.').next())
                        .or_else(|| url.split('?').next().and_then(|u| u.rsplit('.').next()));

                    info!(
                        "[Storage] Resolving input file asset for pin '{}' (filename: {:?}, hash: {:?})...",
                        key, filename, hash
                    );

                    match self.downloader.download_asset(url, hash, ext).await {
                        Ok((local_path, _)) => {
                            let abs_path = crate::storage::cache::normalize_absolute_path(
                                std::fs::canonicalize(&local_path).unwrap_or(local_path),
                            );
                            info!("[Storage] Pin '{}' resolved to local file: {:?}", key, abs_path);
                            *val = serde_json::Value::String(abs_path.to_string_lossy().to_string());
                        }
                        Err(e) => {
                            warn!("[Storage] Could not pre-download asset for pin '{}': {}", key, e);
                        }
                    }
                }
            }
        }

        // 2c. Collect and resolve isolated Python dependencies
        let mut all_deps: Vec<String> = Vec::new();
        for step in &task.steps {
            for dep in &step.dependencies {
                let trimmed = dep.trim();
                if !trimmed.is_empty() {
                    all_deps.push(trimmed.to_string());
                }
            }
        }

        // 2d. Auto-inject Unreal .uproject path from runner.toml when running locally without project context
        if task.executor.eq_ignore_ascii_case("unreal") {
            let has_project = task
                .environment_config
                .get("fullPathProject")
                .or_else(|| task.environment_config.get("uproject_path"))
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);

            if !has_project {
                let mut resolved_uproject: Option<String> = None;

                // 1. Prefer per-workspace unreal_project_path from AppData WorkspaceRegistryDb
                if let (Some(data_dir), Ok(cwd)) = (dirs::data_dir(), std::env::current_dir()) {
                    let registry_dir = data_dir.join("studio.forgity.desktop");
                    if let Ok(registry) = forgity_core::workspace_registry::WorkspaceRegistryDb::open(&registry_dir) {
                        let cwd_str = cwd.to_string_lossy().replace('\\', "/");
                        if let Ok(Some(ws)) = registry.get_workspace_by_root_path(&cwd_str)
                            .or_else(|_| registry.get_workspace_by_root_path(&cwd.to_string_lossy()))
                        {
                            if let Some(up) = ws.unreal_project_path.filter(|p| std::path::Path::new(p.trim()).is_file()) {
                                info!(
                                    "[Dispatcher] Injected Unreal .uproject from Workspace Registry: {}",
                                    up
                                );
                                resolved_uproject = Some(up);
                            }
                        }
                    }
                }

                // 2. Fallback to runner.toml [unreal_projects]
                if resolved_uproject.is_none() {
                    if let Ok((Some(cfg), _)) = crate::config::load_config(None, false) {
                        if let Some(ref projects) = cfg.unreal_projects {
                            let resolved = projects
                                .get("local-default")
                                .filter(|p| std::path::Path::new(p.trim()).is_file())
                                .or_else(|| {
                                    projects
                                        .values()
                                        .find(|p| std::path::Path::new(p.trim()).is_file())
                                });
                            if let Some(uproject_path) = resolved {
                                info!(
                                    "[Dispatcher] Injected Unreal .uproject from runner.toml: {}",
                                    uproject_path
                                );
                                resolved_uproject = Some(uproject_path.clone());
                            }
                        }
                    }
                }

                if let Some(uproject_path) = resolved_uproject {
                    task.environment_config.insert(
                        "fullPathProject".to_string(),
                        serde_json::Value::String(uproject_path),
                    );
                }
            }
        }

        // 3. Resolve Executor Strategy & Validate fail-fast
        let executor = self.executor_registry.get(&task.executor)?;
        executor.validate(&task)?;

        // 4. Resolve executable for this executor (e.g. blender.exe)
        let exe_path = resolve_executor_executable(&task.executor)
            .with_context(|| format!("Could not resolve executable for executor '{}'", task.executor))?;
        info!("[Dispatcher] Resolved executor binary: {:?}", exe_path);

        task.site_packages_path = super::python_packages::prepare(
            &self.storage, &task.executor, &exe_path, &all_deps,
        ).await?.map(|path| path.to_string_lossy().to_string());

        // 5. Prepare temp working directory and task.json
        let temp_dir = PathBuf::from("temp").join(&stage_id);
        create_dir_all(&temp_dir).await.ok();
        let task_json_path = temp_dir.join("task.json");
        let task_bytes = serde_json::to_vec_pretty(&task)?;
        let mut file = File::create(&task_json_path).await?;
        file.write_all(&task_bytes).await?;
        file.flush().await?;

        // 6. Check keep-alive configuration for persistent DCC pool
        let keep_alive_minutes = task
            .environment_config
            .get("keepAliveMinutes")
            .or_else(|| task.environment_config.get("keep_alive_minutes"))
            .and_then(|v| {
                if let Some(n) = v.as_u64() {
                    Some(n as u32)
                } else if let Some(s) = v.as_str() {
                    s.parse::<u32>().ok()
                } else {
                    None
                }
            })
            .unwrap_or(0);

        let is_warm_eligible = keep_alive_minutes > 0 && executor.supports_keep_alive();

        // 7. Create Named Pipe IPC Server for Stage communication
        let pipe_server = Arc::new(PipeServer::new(&stage_id));
        let pipe_path = pipe_server.pipe_path().to_string();

        // Channel for events from guest subprocess
        let (event_tx, mut event_rx) = mpsc::channel::<GuestToHostMessage>(100);

        // 8. Build arguments & env vars via Strategy Pattern
        let abs_guest_script = ensure_guest_script()
            .context("Failed to locate or extract guest runner script stage_runner_guest.py")?;
        info!("[Dispatcher] Using Guest Script: {:?}", abs_guest_script);
        let abs_task_json = std::fs::canonicalize(&task_json_path)
            .unwrap_or(task_json_path.clone());

        let exec_ctx = ExecutionContext {
            guest_script_path: abs_guest_script,
            task_json_path: abs_task_json.clone(),
            pipe_path: pipe_path.clone(),
            exe_path: exe_path.clone(),
        };

        let args = executor.build_args(&task, &exec_ctx)?;
        let extra_env = executor.prepare_env(&task, &exec_ctx)?;

        let task_json_str = abs_task_json.to_string_lossy().to_string();
        let mut env_vars: Vec<(&str, &str)> = vec![
            ("FORGITY_IPC_PIPE", pipe_path.as_str()),
            ("FORGITY_TASK_JSON", task_json_str.as_str()),
            ("PYTHONUNBUFFERED", "1"),
        ];

        // Inject custom environment variables from runner.toml [env]
        if let Some(ref env_map) = self.custom_env {
            for (k, v) in env_map {
                env_vars.push((k.as_str(), v.as_str()));
            }
        }

        for (k, v) in &extra_env {
            env_vars.push((k.as_str(), v.as_str()));
        }

        // Spawn IPC listener in background
        let pipe_server_clone = Arc::clone(&pipe_server);
        let pipe_handle = tokio::spawn(async move {
            if let Err(e) = pipe_server_clone.listen_and_serve(event_tx).await {
                debug!("Pipe server finished/closed: {}", e);
            }
        });

        let (cancel_tx, mut cancel_rx) = tokio::sync::broadcast::channel::<()>(1);
        let mut step_results: Vec<StepResult> = Vec::new();
        let mut stage_succeeded = false;
        let mut stage_error: Option<String> = None;
        let mut guest_handshake_received = false;

        if is_warm_eligible {
            info!(
                "[Dispatcher] Executing Stage {} in WARM Resident DCC mode (keep_alive: {} min)...",
                stage_id, keep_alive_minutes
            );
            let resident_script = crate::process::dcc_pool::ensure_resident_script()
                .context("Failed to locate or extract dcc_resident_host.py")?;
            let resident_args = executor.build_resident_args(&task, &exec_ctx, &resident_script)?;
            let project_path = match task.executor.to_lowercase().as_str() {
                "unreal" => crate::core::executors::unreal::UnrealExecutor.resolve_project_path(&task),
                _ => None,
            };
            let keep_alive_dur = Duration::from_secs((keep_alive_minutes as u64) * 60);

            let (session_key, control_pipe, resident_rx_arc, session_job) = self
                .dcc_pool
                .acquire(
                    executor.name(),
                    &exe_path,
                    project_path,
                    &resident_args,
                    keep_alive_dur,
                    Some(self.storage.base_dir()),
                    task.site_packages_path.as_deref(),
                )
                .await?;

            self.active_stages
                .register(
                    stage_id.clone(),
                    task.pipeline_execution_id.clone(),
                    cancel_tx,
                    Arc::clone(&session_job),
                )
                .await;

            // Dispatch RunStage command to resident host
            if let Err(error) = control_pipe
                .send(&HostToResidentMessage::RunStage {
                    stage_execution_id: stage_id.clone(),
                    task_json_path: abs_task_json.to_string_lossy().to_string(),
                    stage_pipe: pipe_path.clone(),
                })
                .await
            {
                self.active_stages.unregister(&stage_id).await;
                self.dcc_pool.release(&session_key, false).await;
                pipe_handle.abort();
                return Err(error).context("Failed to send RunStage to resident DCC");
            }

            let target_stage_id = stage_id.clone();
            let resident_done_fut = async {
                let mut rx = resident_rx_arc.lock().await;
                while let Some(msg) = rx.recv().await {
                    match msg {
                        ResidentToHostMessage::StageFinished {
                            stage_execution_id,
                            exit_code,
                            success,
                            error_message,
                        } => {
                            if stage_execution_id == target_stage_id {
                                return Ok((exit_code, success, error_message));
                            }
                        }
                        _ => {}
                    }
                }
                anyhow::bail!("Resident DCC control pipe closed before StageFinished signal");
            };

            tokio::pin!(resident_done_fut);

            let mut guest_completed = false;
            let mut resident_finished = false;
            let mut resident_success = false;

            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(5)), if resident_finished != guest_completed => {
                        stage_succeeded = false;
                        if stage_error.is_none() {
                            stage_error = Some("Timed out waiting for matching guest/resident stage completion".to_string());
                        }
                        break;
                    }
                    _ = cancel_rx.recv() => {
                        warn!("[Dispatcher] Cancellation signal received for warm Stage {}. Terminating session...", stage_id);
                        let _ = session_job.terminate(1);
                        stage_error = Some("Execution was cancelled by user.".to_string());
                        stage_succeeded = false;
                        break;
                    }

                    event = event_rx.recv(), if !guest_completed => {
                        let Some(event) = event else {
                            stage_succeeded = false;
                            stage_error = Some("Guest IPC closed before StageCompleted signal".to_string());
                            break;
                        };
                        match event {
                            GuestToHostMessage::Handshake { dcc_name, dcc_version, pid } => {
                                info!("[IPC] Guest Handshake from {} ({:?}), PID: {}", dcc_name, dcc_version, pid);
                                guest_handshake_received = true;
                            }
                            GuestToHostMessage::StepStarted { step_execution_id, step_index } => {
                                info!("[IPC] Step Started: {} (index {})", step_execution_id, step_index);
                            }
                            GuestToHostMessage::StepProgress { step_execution_id, status, progress, message: _, outputs } => {
                                info!("[IPC] Step Progress: {} -> {} ({:.0}%)", step_execution_id, status, progress * 100.0);
                                let progress_msg = StepProgressMessage {
                                    pipeline_execution_id: task.pipeline_execution_id.clone(),
                                    pipeline_id: task.pipeline_id.clone(),
                                    stage_execution_id: stage_id.clone(),
                                    step_execution_id,
                                    status,
                                    outputs,
                                    error_message: None,
                                };
                                if let Err(e) = self.event_sink.emit_step_progress(&progress_msg).await {
                                    warn!("[Dispatcher] Failed to publish StepProgressMessage: {}", e);
                                }
                            }
                            GuestToHostMessage::StepCompleted { step_execution_id, succeeded, outputs, error_message, log } => {
                                info!("[IPC] Step Completed: {} (succeeded={})", step_execution_id, succeeded);
                                step_results.push(StepResult {
                                    step_execution_id: step_execution_id.clone(),
                                    succeeded,
                                    log,
                                    error_message: error_message.clone(),
                                    outputs: outputs.clone(),
                                });

                                let status = if succeeded { "Succeeded" } else { "Failed" };
                                let progress_msg = StepProgressMessage {
                                    pipeline_execution_id: task.pipeline_execution_id.clone(),
                                    pipeline_id: task.pipeline_id.clone(),
                                    stage_execution_id: stage_id.clone(),
                                    step_execution_id,
                                    status: status.to_string(),
                                    outputs: Some(outputs),
                                    error_message: if succeeded { None } else { error_message },
                                };
                                let _ = self.event_sink.emit_step_progress(&progress_msg).await;
                            }
                            GuestToHostMessage::StageCompleted { succeeded, error_message } => {
                                guest_completed = true;
                                info!("[IPC] Stage Completed signal: succeeded={}", succeeded);
                                stage_succeeded = succeeded;
                                if error_message.is_some() {
                                    stage_error = error_message;
                                }
                            }
                            GuestToHostMessage::FetchAssetRequest { request_id, asset_id, pin_key: _ } => {
                                info!("[IPC] On-Demand Asset Fetch requested: id={} (req={})", asset_id, request_id);
                                match self.storage.find_cached_asset(&asset_id).await {
                                    Ok(Some(cached_path)) => {
                                        let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                            request_id,
                                            success: true,
                                            local_path: Some(cached_path.to_string_lossy().to_string()),
                                            error: None,
                                        }).await;
                                    }
                                    _ => {
                                        let maybe_url = task.resolved_data.get(&asset_id).and_then(|v| v.as_str());
                                        if let Some(url) = maybe_url {
                                            match self.downloader.download_asset(url, Some(&asset_id), None).await {
                                                Ok((path, _)) => {
                                                    let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                                        request_id,
                                                        success: true,
                                                        local_path: Some(path.to_string_lossy().to_string()),
                                                        error: None,
                                                    }).await;
                                                }
                                                Err(e) => {
                                                    let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                                        request_id,
                                                        success: false,
                                                        local_path: None,
                                                        error: Some(e.to_string()),
                                                    }).await;
                                                }
                                            }
                                        } else {
                                            let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                                request_id,
                                                success: false,
                                                local_path: None,
                                                error: Some(format!("Asset '{}' not found in cache or metadata", asset_id)),
                                            }).await;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    res_finished = &mut resident_done_fut, if !resident_finished => {
                        match res_finished {
                            Ok((code, success, err_opt)) => {
                                info!("[Dispatcher] Resident DCC finished stage: code={}, success={}", code, success);
                                resident_finished = true;
                                resident_success = success && code == 0;
                                if !resident_success && stage_error.is_none() {
                                    stage_error = err_opt.or_else(|| Some(format!("Resident DCC exited with code {}", code)));
                                }
                            }
                            Err(e) => {
                                error!("[Dispatcher] Resident DCC pipe error: {}", e);
                                stage_succeeded = false;
                                stage_error = Some(e.to_string());
                                break;
                            }
                        }
                    }
                }
                // The control pipe may finish before the stage IPC queue is drained.
                // Both messages are required; process health cannot override a failed step.
                if guest_completed && resident_finished {
                    stage_succeeded = stage_succeeded && resident_success && guest_handshake_received
                        && step_results.iter().all(|step| step.succeeded);
                    break;
                }
            }

            self.dcc_pool.release(&session_key, stage_succeeded).await;

        } else {
            // Standard Cold Spawning Mode
            let job_object = Arc::new(JobObject::create().context("Failed to initialize Windows Job Object")?);

            self.active_stages
                .register(
                    stage_id.clone(),
                    task.pipeline_execution_id.clone(),
                    cancel_tx,
                    Arc::clone(&job_object),
                )
                .await;

            let proc_handle = SubprocessRunner::spawn_with_job_object(
                &exe_path,
                &args,
                &env_vars,
                Some(self.storage.base_dir()),
                &stage_id,
                &job_object,
            );

            tokio::pin!(proc_handle);

            loop {
                tokio::select! {
                    _ = cancel_rx.recv() => {
                        warn!("[Dispatcher] Cancellation signal received for Stage {}. Terminating active DCC subprocess...", stage_id);
                        let _ = job_object.terminate(1);
                        stage_error = Some("Execution was cancelled by user.".to_string());
                        stage_succeeded = false;
                        break;
                    }

                    Some(event) = event_rx.recv() => {
                        match event {
                            GuestToHostMessage::Handshake { dcc_name, dcc_version, pid } => {
                                info!("[IPC] Guest Handshake from {} ({:?}), PID: {}", dcc_name, dcc_version, pid);
                                guest_handshake_received = true;
                            }
                            GuestToHostMessage::StepStarted { step_execution_id, step_index } => {
                                info!("[IPC] Step Started: {} (index {})", step_execution_id, step_index);
                            }
                            GuestToHostMessage::StepProgress { step_execution_id, status, progress, message: _, outputs } => {
                                info!("[IPC] Step Progress: {} -> {} ({:.0}%)", step_execution_id, status, progress * 100.0);
                                let progress_msg = StepProgressMessage {
                                    pipeline_execution_id: task.pipeline_execution_id.clone(),
                                    pipeline_id: task.pipeline_id.clone(),
                                    stage_execution_id: stage_id.clone(),
                                    step_execution_id,
                                    status,
                                    outputs,
                                    error_message: None,
                                };
                                if let Err(e) = self.event_sink.emit_step_progress(&progress_msg).await {
                                    warn!("[Dispatcher] Failed to publish StepProgressMessage: {}", e);
                                }
                            }
                            GuestToHostMessage::StepCompleted { step_execution_id, succeeded, outputs, error_message, log } => {
                                info!("[IPC] Step Completed: {} (succeeded={})", step_execution_id, succeeded);
                                step_results.push(StepResult {
                                    step_execution_id: step_execution_id.clone(),
                                    succeeded,
                                    log,
                                    error_message: error_message.clone(),
                                    outputs: outputs.clone(),
                                });

                                let status = if succeeded { "Succeeded" } else { "Failed" };
                                let progress_msg = StepProgressMessage {
                                    pipeline_execution_id: task.pipeline_execution_id.clone(),
                                    pipeline_id: task.pipeline_id.clone(),
                                    stage_execution_id: stage_id.clone(),
                                    step_execution_id,
                                    status: status.to_string(),
                                    outputs: Some(outputs),
                                    error_message: if succeeded { None } else { error_message },
                                };
                                let _ = self.event_sink.emit_step_progress(&progress_msg).await;
                            }
                            GuestToHostMessage::StageCompleted { succeeded, error_message } => {
                                info!("[IPC] Stage Completed signal: succeeded={}", succeeded);
                                stage_succeeded = succeeded;
                                stage_error = error_message;
                            }
                            GuestToHostMessage::FetchAssetRequest { request_id, asset_id, pin_key: _ } => {
                                info!("[IPC] On-Demand Asset Fetch requested: id={} (req={})", asset_id, request_id);
                                match self.storage.find_cached_asset(&asset_id).await {
                                    Ok(Some(cached_path)) => {
                                        let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                            request_id,
                                            success: true,
                                            local_path: Some(cached_path.to_string_lossy().to_string()),
                                            error: None,
                                        }).await;
                                    }
                                    _ => {
                                        let maybe_url = task.resolved_data.get(&asset_id).and_then(|v| v.as_str());
                                        if let Some(url) = maybe_url {
                                            match self.downloader.download_asset(url, Some(&asset_id), None).await {
                                                Ok((path, _)) => {
                                                    let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                                        request_id,
                                                        success: true,
                                                        local_path: Some(path.to_string_lossy().to_string()),
                                                        error: None,
                                                    }).await;
                                                }
                                                Err(e) => {
                                                    let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                                        request_id,
                                                        success: false,
                                                        local_path: None,
                                                        error: Some(e.to_string()),
                                                    }).await;
                                                }
                                            }
                                        } else {
                                            let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                                request_id,
                                                success: false,
                                                local_path: None,
                                                error: Some(format!("Asset '{}' not found in cache or metadata", asset_id)),
                                            }).await;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    proc_result = &mut proc_handle => {
                        match proc_result {
                            Ok(res) => {
                                info!("[Dispatcher] Subprocess exited: exit_code={:?}, success={}", res.exit_code, res.success);
                                if !guest_handshake_received {
                                    stage_succeeded = false;
                                    stage_error = Some(format!(
                                        "Guest DCC script failed to launch or connect to IPC (exit code {:?}). Check logs at logs/stage_{}.log",
                                        res.exit_code, stage_id
                                    ));
                                } else if stage_succeeded {
                                    if !res.success {
                                        warn!(
                                            "[Dispatcher] Stage {} completed successfully according to Guest IPC, but DCC host process exited with code {:?}. Preserving stage success.",
                                            stage_id, res.exit_code
                                        );
                                    }
                                } else if !res.success && stage_error.is_none() {
                                    stage_succeeded = false;
                                    stage_error = Some(format!("Subprocess exited with non-zero code {:?}", res.exit_code));
                                } else if res.success && stage_error.is_none() {
                                    if !stage_succeeded {
                                        stage_succeeded = true;
                                    }
                                }
                            }
                            Err(e) => {
                                error!("[Dispatcher] Subprocess execution error: {}", e);
                                stage_succeeded = false;
                                stage_error = Some(e.to_string());
                            }
                        }
                        break;
                    }
                }
            }
        }

        self.active_stages.unregister(&stage_id).await;

        // Wait brief moment for any remaining pipe cleanup
        pipe_handle.abort();

        // 11. Clean up temp task file and executor artifacts
        let _ = remove_file(&task_json_path).await;
        let _ = executor.cleanup(&task);

        let result = StageResultMessage {
            stage_execution_id: stage_id.clone(),
            pipeline_execution_id: task.pipeline_execution_id,
            pipeline_id: task.pipeline_id,
            succeeded: stage_succeeded,
            log: Some(format!("Execution completed. Total step results: {}", step_results.len())),
            error_message: stage_error,
            step_results,
        };

        info!(
            "[Dispatcher] Finished Stage: {} (succeeded={}). Sending final StageResultMessage...",
            stage_id, result.succeeded
        );

        self.event_sink.emit_stage_result(&result).await?;

        Ok(result)
    }
}
