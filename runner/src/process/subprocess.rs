use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::fs::{create_dir_all, File};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tracing::{debug, error, info};

use super::job_object::JobObject;

pub struct ProcessExecutionResult {
    pub exit_code: Option<i32>,
    pub success: bool,
    pub log_file_path: PathBuf,
}

pub struct SubprocessRunner;

impl SubprocessRunner {
    /// Launches a child process, assigns it to the Windows Job Object for lifecycle containment,
    /// and asynchronously pipes stdout/stderr both to disk log file and logger.
    pub async fn spawn_with_job_object(
        executable: &Path,
        args: &[String],
        env_vars: &[(&str, &str)],
        working_dir: Option<&Path>,
        log_id: &str,
        job_object: &JobObject,
    ) -> Result<ProcessExecutionResult> {
        let logs_dir = PathBuf::from("logs");
        create_dir_all(&logs_dir).await.ok();
        let log_file_path = logs_dir.join(format!("{}.log", log_id));

        info!(
            "Spawning subprocess: {:?} with {} args (logging to {:?})",
            executable,
            args.len(),
            log_file_path
        );

        let mut cmd = Command::new(executable);
        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        for (k, v) in env_vars {
            cmd.env(k, v);
        }

        if let Some(wd) = working_dir {
            cmd.current_dir(wd);
        }

        let mut child = cmd
            .spawn()
            .with_context(|| format!("Failed to spawn executable {:?}", executable))?;

        if let Some(pid) = child.id() {
            info!("Child process spawned with PID: {}", pid);
            if let Err(e) = job_object.assign_pid(pid) {
                error!("Failed to assign PID {} to Job Object: {}. Process will still execute but without auto-kill protection.", pid, e);
            } else {
                debug!("PID {} successfully assigned to Windows Job Object", pid);
            }
        }

        let stdout = child.stdout.take().context("Failed to open child stdout")?;
        let stderr = child.stderr.take().context("Failed to open child stderr")?;

        let mut log_file = File::create(&log_file_path)
            .await
            .with_context(|| format!("Failed to create log file {:?}", log_file_path))?;

        // Asynchronously stream stdout and stderr
        let mut stdout_lines = BufReader::new(stdout).lines();
        let mut stderr_lines = BufReader::new(stderr).lines();

        let stdout_handle = tokio::spawn(async move {
            let mut captured = Vec::new();
            while let Ok(Some(line)) = stdout_lines.next_line().await {
                captured.push(line);
            }
            captured
        });

        let stderr_handle = tokio::spawn(async move {
            let mut captured = Vec::new();
            while let Ok(Some(line)) = stderr_lines.next_line().await {
                captured.push(line);
            }
            captured
        });

        let status = child.wait().await?;
        let stdout_output = stdout_handle.await.unwrap_or_default();
        let stderr_output = stderr_handle.await.unwrap_or_default();

        // Write captured stdout/stderr to disk log file
        for line in &stdout_output {
            log_file.write_all(line.as_bytes()).await.ok();
            log_file.write_all(b"\n").await.ok();
        }
        if !stderr_output.is_empty() {
            log_file.write_all(b"\n--- STDERR ---\n").await.ok();
            for line in &stderr_output {
                log_file.write_all(line.as_bytes()).await.ok();
                log_file.write_all(b"\n").await.ok();
            }
        }
        log_file.flush().await.ok();

        let success = status.success();
        let exit_code = status.code();

        info!(
            "Subprocess exited with code: {:?}, success: {}",
            exit_code, success
        );

        Ok(ProcessExecutionResult {
            exit_code,
            success,
            log_file_path,
        })
    }
}
