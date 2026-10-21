use anyhow::{Context, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::{create_dir_all, remove_file, File};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use super::contracts::{StageResultMessage, StageTaskMessage, StepProgressMessage, StepResult};
use super::executors::{ExecutionContext, ExecutorRegistry};
use crate::ipc::pipe_server::PipeServer;
use crate::ipc::protocol::{GuestToHostMessage, HostToGuestMessage};
use crate::process::active_stage::ActiveStageManager;
use crate::process::job_object::JobObject;
use crate::process::subprocess::SubprocessRunner;
use crate::queue::rabbitmq::RabbitMqClient;
use crate::storage::cache::StorageManager;
use crate::storage::downloader::StreamDownloader;
use crate::storage::lock::StorageLockGuard;
use crate::system::dcc::resolve_executor_executable;

use std::collections::HashMap;

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
    rabbitmq: RabbitMqClient,
    storage: StorageManager,
    downloader: StreamDownloader,
    active_stages: Arc<ActiveStageManager>,
    executor_registry: Arc<ExecutorRegistry>,
    custom_env: Option<HashMap<String, String>>,
}

impl StageDispatcher {
    pub fn new(
        rabbitmq: RabbitMqClient,
        active_stages: Arc<ActiveStageManager>,
        custom_env: Option<HashMap<String, String>>,
    ) -> Self {
        let storage = StorageManager::new(None);
        let downloader = StreamDownloader::new(StorageManager::new(None));
        let executor_registry = Arc::new(ExecutorRegistry::new());
        Self {
            rabbitmq,
            storage,
            downloader,
            active_stages,
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
        let _storage_lock = StorageLockGuard::acquire(None).await.ok();

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

        // 3. Resolve Executor Strategy & Validate fail-fast
        let executor = self.executor_registry.get(&task.executor)?;
        executor.validate(&task)?;

        // 4. Resolve executable for this executor (e.g. blender.exe)
        let exe_path = resolve_executor_executable(&task.executor)
            .with_context(|| format!("Could not resolve executable for executor '{}'", task.executor))?;
        info!("[Dispatcher] Resolved executor binary: {:?}", exe_path);

        // 5. Prepare temp working directory and task.json
        let temp_dir = PathBuf::from("temp").join(&stage_id);
        create_dir_all(&temp_dir).await.ok();
        let task_json_path = temp_dir.join("task.json");
        let task_bytes = serde_json::to_vec_pretty(&task)?;
        let mut file = File::create(&task_json_path).await?;
        file.write_all(&task_bytes).await?;
        file.flush().await?;

        // 6. Create Windows Job Object for lifecycle containment
        let job_object = Arc::new(JobObject::create()
            .context("Failed to initialize Windows Job Object")?);

        let (cancel_tx, mut cancel_rx) = tokio::sync::broadcast::channel::<()>(1);
        self.active_stages.register(
            stage_id.clone(),
            task.pipeline_execution_id.clone(),
            cancel_tx,
            Arc::clone(&job_object),
        ).await;

        // 7. Create Named Pipe IPC Server
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

        // 8. Spawn IPC listener in background
        let pipe_server_clone = Arc::clone(&pipe_server);
        let pipe_handle = tokio::spawn(async move {
            if let Err(e) = pipe_server_clone.listen_and_serve(event_tx).await {
                debug!("Pipe server finished/closed: {}", e);
            }
        });

        // 9. Spawn DCC Subprocess
        let proc_handle = SubprocessRunner::spawn_with_job_object(
            &exe_path,
            &args,
            &env_vars,
            Some(self.storage.base_dir()),
            &stage_id,
            &job_object,
        );

        // 10. Event loop processing IPC messages while waiting for process completion
        let mut step_results: Vec<StepResult> = Vec::new();
        let mut stage_succeeded = false;
        let mut stage_error: Option<String> = None;
        let mut guest_handshake_received = false;

        tokio::pin!(proc_handle);

        loop {
            tokio::select! {
                // Cancellation signal received from gRPC remote command
                _ = cancel_rx.recv() => {
                    warn!("[Dispatcher] Cancellation signal received for Stage {}. Terminating active DCC subprocess...", stage_id);
                    let _ = job_object.terminate(1);
                    stage_error = Some("Execution was cancelled by user.".to_string());
                    stage_succeeded = false;
                    break;
                }

                // IPC event received from guest subprocess
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
                            if let Err(e) = self.rabbitmq.send_progress(&progress_msg).await {
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
                            let _ = self.rabbitmq.send_progress(&progress_msg).await;
                        }
                        GuestToHostMessage::StageCompleted { succeeded, error_message } => {
                            info!("[IPC] Stage Completed signal: succeeded={}", succeeded);
                            stage_succeeded = succeeded;
                            stage_error = error_message;
                        }
                        GuestToHostMessage::FetchAssetRequest { request_id, asset_id, pin_key: _ } => {
                            info!("[IPC] On-Demand Asset Fetch requested: id={} (req={})", asset_id, request_id);

                            // Check local cache first
                            match self.storage.find_cached_asset(&asset_id).await {
                                Ok(Some(cached_path)) => {
                                    info!("[IPC] Asset found in cache: {:?}", cached_path);
                                    let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                        request_id,
                                        success: true,
                                        local_path: Some(cached_path.to_string_lossy().to_string()),
                                        error: None,
                                    }).await;
                                }
                                _ => {
                                    // Check if resolved_data contains a download URL for this asset
                                    let maybe_url = task.resolved_data.get(&asset_id)
                                        .and_then(|v| v.as_str());

                                    if let Some(url) = maybe_url {
                                        info!("[IPC] Downloading on-demand asset from resolved URL: {}", url);
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
                                                error!("[IPC] Failed to download on-demand asset: {}", e);
                                                let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                                    request_id,
                                                    success: false,
                                                    local_path: None,
                                                    error: Some(e.to_string()),
                                                }).await;
                                            }
                                        }
                                    } else {
                                        warn!("[IPC] Asset {} not cached and no download URL found in task metadata", asset_id);
                                        let _ = pipe_server.send_to_guest(HostToGuestMessage::FetchAssetResponse {
                                            request_id,
                                            success: false,
                                            local_path: None,
                                            error: Some(format!("Asset '{}' not found in cache or task metadata", asset_id)),
                                        }).await;
                                    }
                                }
                            }
                        }
                    }
                }

                // Subprocess terminated
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

        self.rabbitmq.send_result(&result).await?;

        Ok(result)
    }
}
