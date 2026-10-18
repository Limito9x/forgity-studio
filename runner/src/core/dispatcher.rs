use anyhow::{Context, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::{create_dir_all, remove_file, File};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use super::contracts::{StageResultMessage, StageTaskMessage, StepProgressMessage, StepResult};
use crate::ipc::pipe_server::PipeServer;
use crate::ipc::protocol::GuestToHostMessage;
use crate::process::job_object::JobObject;
use crate::process::subprocess::SubprocessRunner;
use crate::queue::rabbitmq::RabbitMqClient;
use crate::system::dcc::resolve_executor_executable;

pub struct StageDispatcher {
    rabbitmq: RabbitMqClient,
}

impl StageDispatcher {
    pub fn new(rabbitmq: RabbitMqClient) -> Self {
        Self { rabbitmq }
    }

    /// Dispatches a single StageTaskMessage: creates Job Object, opens IPC pipe,
    /// spawns DCC subprocess, streams progress, collects results and reports back.
    pub async fn dispatch_stage(&self, task: StageTaskMessage) -> Result<StageResultMessage> {
        let stage_id = task.stage_execution_id.clone();
        info!(
            "════════════════════════════════════════════════════════════════\n\
             [Dispatcher] Starting execution of Stage: {}\n\
             [Dispatcher] Pipeline: {} | Executor: {} | Steps: {}\n\
             ════════════════════════════════════════════════════════════════",
            stage_id, task.pipeline_execution_id, task.executor, task.steps.len()
        );

        // 1. Resolve executable for this executor (e.g. blender.exe)
        let exe_path = resolve_executor_executable(&task.executor)
            .with_context(|| format!("Could not resolve executable for executor '{}'", task.executor))?;
        info!("[Dispatcher] Resolved executor binary: {:?}", exe_path);

        // 2. Prepare temp working directory and task.json
        let temp_dir = PathBuf::from("temp").join(&stage_id);
        create_dir_all(&temp_dir).await.ok();
        let task_json_path = temp_dir.join("task.json");
        let task_bytes = serde_json::to_vec_pretty(&task)?;
        let mut file = File::create(&task_json_path).await?;
        file.write_all(&task_bytes).await?;
        file.flush().await?;

        // 3. Create Windows Job Object for lifecycle containment
        let job_object = JobObject::create()
            .context("Failed to initialize Windows Job Object")?;

        // 4. Create Named Pipe IPC Server
        let pipe_server = Arc::new(PipeServer::new(&stage_id));
        let pipe_path = pipe_server.pipe_path().to_string();

        // Channel for events from guest subprocess
        let (event_tx, mut event_rx) = mpsc::channel::<GuestToHostMessage>(100);

        // 5. Build arguments for DCC Guest
        let guest_script = PathBuf::from("scripts").join("stage_runner_guest.py");
        let abs_guest_script = std::fs::canonicalize(&guest_script)
            .unwrap_or(guest_script);
        let abs_task_json = std::fs::canonicalize(&task_json_path)
            .unwrap_or(task_json_path.clone());

        let mut args: Vec<String> = Vec::new();
        match task.executor.to_lowercase().as_str() {
            "blender" => {
                args.push("-b".to_string()); // Headless background
                args.push("--python".to_string());
                args.push(abs_guest_script.to_string_lossy().to_string());
                args.push("--".to_string());
                args.push("--pipe".to_string());
                args.push(pipe_path.clone());
                args.push("--task".to_string());
                args.push(abs_task_json.to_string_lossy().to_string());
            }
            "unreal" => {
                args.push("-run=ExecutePythonScript".to_string());
                args.push(format!("-script={}", abs_guest_script.display()));
                args.push("-nullrhi".to_string());
                args.push("-unattended".to_string());
                args.push("-nosplash".to_string());
            }
            _ => {
                // Standalone Python
                args.push(abs_guest_script.to_string_lossy().to_string());
                args.push("--pipe".to_string());
                args.push(pipe_path.clone());
                args.push("--task".to_string());
                args.push(abs_task_json.to_string_lossy().to_string());
            }
        }

        let task_json_str = abs_task_json.to_string_lossy().to_string();
        let env_vars = [
            ("FORGITY_IPC_PIPE", pipe_path.as_str()),
            ("FORGITY_TASK_JSON", task_json_str.as_str()),
            ("PYTHONUNBUFFERED", "1"),
        ];

        // 6. Spawn IPC listener in background
        let pipe_server_clone = Arc::clone(&pipe_server);
        let pipe_handle = tokio::spawn(async move {
            if let Err(e) = pipe_server_clone.listen_and_serve(event_tx).await {
                debug!("Pipe server finished/closed: {}", e);
            }
        });

        // 7. Spawn DCC Subprocess
        let proc_handle = SubprocessRunner::spawn_with_job_object(
            &exe_path,
            &args,
            &env_vars,
            None,
            &stage_id,
            &job_object,
        );

        // 8. Event loop processing IPC messages while waiting for process completion
        let mut step_results: Vec<StepResult> = Vec::new();
        let mut stage_succeeded = false;
        let mut stage_error: Option<String> = None;

        tokio::pin!(proc_handle);

        loop {
            tokio::select! {
                // IPC event received from guest subprocess
                Some(event) = event_rx.recv() => {
                    match event {
                        GuestToHostMessage::Handshake { dcc_name, dcc_version, pid } => {
                            info!("[IPC] Guest Handshake from {} ({:?}), PID: {}", dcc_name, dcc_version, pid);
                        }
                        GuestToHostMessage::StepStarted { step_execution_id, step_index } => {
                            info!("[IPC] Step Started: {} (index {})", step_execution_id, step_index);
                        }
                        GuestToHostMessage::StepProgress { step_execution_id, status, progress, message, outputs } => {
                            info!("[IPC] Step Progress: {} -> {} ({:.0}%)", step_execution_id, status, progress * 100.0);
                            let progress_msg = StepProgressMessage {
                                pipeline_execution_id: task.pipeline_execution_id.clone(),
                                pipeline_id: task.pipeline_id.clone(),
                                stage_execution_id: stage_id.clone(),
                                step_execution_id,
                                status,
                                outputs,
                                error_message: message,
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
                                error_message,
                            };
                            let _ = self.rabbitmq.send_progress(&progress_msg).await;
                        }
                        GuestToHostMessage::StageCompleted { succeeded, error_message } => {
                            info!("[IPC] Stage Completed signal: succeeded={}", succeeded);
                            stage_succeeded = succeeded;
                            stage_error = error_message;
                        }
                        GuestToHostMessage::FetchAssetRequest { request_id, asset_id, pin_key: _ } => {
                            debug!("[IPC] FetchAssetRequest: {} for asset {}", request_id, asset_id);
                            // Future phase: on-demand S3 download
                        }
                    }
                }

                // Subprocess terminated
                proc_result = &mut proc_handle => {
                    match proc_result {
                        Ok(res) => {
                            info!("[Dispatcher] Subprocess exited: exit_code={:?}, success={}", res.exit_code, res.success);
                            if !res.success && stage_error.is_none() {
                                stage_error = Some(format!("Subprocess exited with non-zero code {:?}", res.exit_code));
                            }
                            if res.success && stage_error.is_none() {
                                stage_succeeded = true;
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

        // Wait brief moment for any remaining pipe cleanup
        pipe_handle.abort();

        // 9. Clean up temp task file
        let _ = remove_file(&task_json_path).await;

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
