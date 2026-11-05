use anyhow::{bail, Context, Result};
use hex::ToHex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{Pid, System};
use tokio::fs::{create_dir_all, File};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, error, info, warn};

use super::job_object::JobObject;
use crate::ipc::control_pipe::DccControlPipe;
use crate::ipc::protocol::{HostToResidentMessage, ResidentToHostMessage};

const EMBEDDED_RESIDENT_SCRIPT: &str = include_str!("../../scripts/dcc_resident_host.py");

/// Ensures that `dcc_resident_host.py` is present and returns its absolute path.
pub fn ensure_resident_script() -> Result<PathBuf> {
    // 1. Check if scripts/dcc_resident_host.py exists in CWD
    let cwd_script = PathBuf::from("scripts").join("dcc_resident_host.py");
    if cwd_script.is_file() {
        if let Ok(canon) = std::fs::canonicalize(&cwd_script) {
            return Ok(canon);
        }
    }

    // 2. Check if scripts/dcc_resident_host.py exists next to current executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let exe_script = exe_dir.join("scripts").join("dcc_resident_host.py");
            if exe_script.is_file() {
                if let Ok(canon) = std::fs::canonicalize(&exe_script) {
                    return Ok(canon);
                }
            }
        }
    }

    // 3. Fallback: Write embedded script to %LOCALAPPDATA%/Forgity/scripts/dcc_resident_host.py
    let data_dir = crate::cli::daemon::get_daemon_data_dir();
    let target_dir = data_dir.join("scripts");
    let _ = std::fs::create_dir_all(&target_dir);
    let target_file = target_dir.join("dcc_resident_host.py");

    let _ = std::fs::write(&target_file, EMBEDDED_RESIDENT_SCRIPT);

    if let Ok(canon) = std::fs::canonicalize(&target_file) {
        Ok(canon)
    } else {
        Ok(target_file)
    }
}

/// Computes a deterministic 12-char session key based on lowercase exe and project paths.
pub fn compute_dcc_session_key(exe_path: &Path, project_path: Option<&str>) -> String {
    let mut hasher = Sha256::new();
    let norm_exe = exe_path.to_string_lossy().to_lowercase().replace('\\', "/");
    hasher.update(norm_exe.as_bytes());
    hasher.update(b"|");
    if let Some(p) = project_path {
        let norm_proj = p.to_lowercase().replace('\\', "/");
        hasher.update(norm_proj.as_bytes());
    }
    let full_hex = hasher.finalize().encode_hex::<String>();
    full_hex[..12].to_string()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Starting,
    Idle,
    Busy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DccSessionInfo {
    pub key: String,
    pub executor: String,
    pub project_path: Option<String>,
    pub pid: u32,
    pub state: SessionState,
    pub started_at_secs: u64,
    pub remaining_seconds: i64,
    pub keep_alive_minutes: u32,
}

pub struct DccSession {
    pub key: String,
    pub executor: String,
    pub project_path: Option<String>,
    pub pid: u32,
    pub job_object: Arc<JobObject>,
    pub control_pipe: Arc<DccControlPipe>,
    pub resident_rx: Arc<Mutex<mpsc::Receiver<ResidentToHostMessage>>>,
    pub started_at: Instant,
    pub started_at_sys: SystemTime,
    pub last_used_at: Instant,
    pub keep_alive: Duration,
    pub state: SessionState,
}

impl DccSession {
    pub fn is_alive(&self) -> bool {
        let mut system = System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        system.process(Pid::from_u32(self.pid)).is_some()
    }

    pub fn to_info(&self) -> DccSessionInfo {
        let elapsed = self.last_used_at.elapsed();
        let remaining_secs = if self.state == SessionState::Busy {
            self.keep_alive.as_secs() as i64
        } else if elapsed >= self.keep_alive {
            0
        } else {
            (self.keep_alive - elapsed).as_secs() as i64
        };

        let started_at_secs = self
            .started_at_sys
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        DccSessionInfo {
            key: self.key.clone(),
            executor: self.executor.clone(),
            project_path: self.project_path.clone(),
            pid: self.pid,
            state: self.state,
            started_at_secs,
            remaining_seconds: remaining_secs,
            keep_alive_minutes: (self.keep_alive.as_secs() / 60) as u32,
        }
    }
}

pub struct DccPool {
    sessions: Arc<Mutex<HashMap<String, DccSession>>>,
    data_dir: PathBuf,
}

impl DccPool {
    pub fn new(data_dir: PathBuf) -> Self {
        let pool = Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            data_dir,
        };
        pool.start_reaper();
        pool
    }

    /// Spawns background task to monitor and reap idle expired DCC sessions.
    fn start_reaper(&self) {
        let sessions_clone = Arc::clone(&self.sessions);
        let data_dir_clone = self.data_dir.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;

                let mut to_shutdown: Vec<(String, Arc<DccControlPipe>, Arc<JobObject>)> = Vec::new();
                {
                    let mut guard = sessions_clone.lock().await;
                    let now = Instant::now();

                    // Check dead or expired sessions
                    let mut dead_keys = Vec::new();
                    for (key, session) in guard.iter() {
                        if !session.is_alive() {
                            info!("[DccPool Reaper] Session {} (PID {}) is dead, marking for eviction.", key, session.pid);
                            dead_keys.push(key.clone());
                        } else if session.state == SessionState::Idle && now.duration_since(session.last_used_at) >= session.keep_alive {
                            info!(
                                "[DccPool Reaper] Session {} (PID {}) idle timeout expired (keep_alive: {:?}). Initiating shutdown.",
                                key, session.pid, session.keep_alive
                            );
                            to_shutdown.push((key.clone(), Arc::clone(&session.control_pipe), Arc::clone(&session.job_object)));
                        }
                    }

                    for key in dead_keys {
                        guard.remove(&key);
                    }
                }

                for (key, pipe, job) in to_shutdown {
                    info!("[DccPool Reaper] Sending Shutdown to session {}...", key);
                    let _ = pipe.send(&HostToResidentMessage::Shutdown).await;

                    // Wait up to 10s for clean exit, then terminate job
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    let _ = job.terminate(0);

                    let mut guard = sessions_clone.lock().await;
                    guard.remove(&key);
                }

                // Update snapshot file on disk
                Self::write_snapshot_file(&sessions_clone, &data_dir_clone).await;
            }
        });
    }

    /// Acquires a warm session lease for the given executable and project path, or spawns a new resident process.
    pub async fn acquire(
        &self,
        executor_name: &str,
        exe_path: &Path,
        project_path: Option<&str>,
        resident_args: &[String],
        keep_alive: Duration,
        working_dir: Option<&Path>,
    ) -> Result<(String, Arc<DccControlPipe>, Arc<Mutex<mpsc::Receiver<ResidentToHostMessage>>>, Arc<JobObject>)> {
        let key = compute_dcc_session_key(exe_path, project_path);

        // 1. Evict any existing session with the same executor but different project (enforce single warm session per executor)
        self.stop_other_executor_sessions(executor_name, &key).await;

        // 2. Check if a warm session for this key is already ready & alive
        {
            let mut guard = self.sessions.lock().await;
            if let Some(session) = guard.get_mut(&key) {
                if session.is_alive() && session.state == SessionState::Idle {
                    info!(
                        "[DccPool] Reusing warm resident DCC session {} (PID: {}) for executor '{}'",
                        key, session.pid, executor_name
                    );
                    session.state = SessionState::Busy;
                    session.keep_alive = keep_alive;
                    session.last_used_at = Instant::now();
                    Self::write_snapshot_file(&self.sessions, &self.data_dir).await;
                    return Ok((
                        key.clone(),
                        Arc::clone(&session.control_pipe),
                        Arc::clone(&session.resident_rx),
                        Arc::clone(&session.job_object),
                    ));
                } else if !session.is_alive() {
                    warn!("[DccPool] Session {} was marked idle but process is dead. Evicting.", key);
                    guard.remove(&key);
                }
            }
        }

        // 3. Spawn a new resident process
        info!(
            "[DccPool] Spawning new warm resident DCC process for key {} (executor: '{}', project: {:?})...",
            key, executor_name, project_path
        );

        let control_pipe = Arc::new(DccControlPipe::new(&key));
        let pipe_path = control_pipe.pipe_path().to_string();

        let (resident_tx, resident_rx) = mpsc::channel::<ResidentToHostMessage>(100);
        let resident_rx_arc = Arc::new(Mutex::new(resident_rx));

        // Start listening on control pipe in background
        let control_pipe_clone = Arc::clone(&control_pipe);
        tokio::spawn(async move {
            if let Err(e) = control_pipe_clone.listen_and_serve(resident_tx).await {
                debug!("[DccControlPipe] Listener completed/closed: {}", e);
            }
        });

        // Create Windows Job Object with KILL_ON_JOB_CLOSE
        let job_object = Arc::new(JobObject::create().context("Failed to create Job Object for DCC session")?);

        // Spawn process
        let logs_dir = PathBuf::from("logs");
        create_dir_all(&logs_dir).await.ok();
        let log_file_path = logs_dir.join(format!("dcc_{}.log", key));

        let mut cmd = Command::new(exe_path);
        cmd.args(resident_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .env("FORGITY_DCC_CONTROL_PIPE", &pipe_path)
            .env("PYTHONUNBUFFERED", "1");

        if let Some(wd) = working_dir {
            cmd.current_dir(wd);
        }

        let mut child = cmd
            .spawn()
            .with_context(|| format!("Failed to spawn resident DCC executable {:?}", exe_path))?;

        let pid = child.id().unwrap_or(0);
        if pid > 0 {
            if let Err(e) = job_object.assign_pid(pid) {
                error!("[DccPool] Failed to assign resident PID {} to Job Object: {}", pid, e);
            } else {
                info!("[DccPool] Assigned resident PID {} to Windows Job Object", pid);
            }
        }

        // Stream stdout/stderr to logs/dcc_{key}.log in background
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let log_file_clone = log_file_path.clone();

        tokio::spawn(async move {
            let mut out_file = match File::create(&log_file_clone).await {
                Ok(f) => Some(f),
                Err(e) => {
                    warn!("[DccPool] Could not create log file {:?}: {}", log_file_clone, e);
                    None
                }
            };

            if let Some(out) = stdout {
                let mut reader = BufReader::new(out).lines();
                let mut file_opt = out_file.take();
                tokio::spawn(async move {
                    use tokio::io::AsyncWriteExt;
                    while let Ok(Some(line)) = reader.next_line().await {
                        if let Some(f) = file_opt.as_mut() {
                            let _ = f.write_all(format!("{}\n", line).as_bytes()).await;
                        }
                    }
                });
            }

            if let Some(err) = stderr {
                let mut reader = BufReader::new(err).lines();
                tokio::spawn(async move {
                    while let Ok(Some(line)) = reader.next_line().await {
                        debug!("[Dcc resident stderr] {}", line);
                    }
                });
            }
        });

        // 4. Wait for Ready handshake message from resident script (timeout: 120s)
        info!("[DccPool] Waiting for resident DCC Ready signal on control pipe (timeout 120s)...");
        let ready_timeout = Duration::from_secs(120);

        let handshake_res = {
            let mut rx_guard = resident_rx_arc.lock().await;
            tokio::time::timeout(ready_timeout, rx_guard.recv()).await
        };

        match handshake_res {
            Ok(Some(ResidentToHostMessage::Ready { pid: guest_pid, dcc_name, dcc_version })) => {
                info!(
                    "[DccPool] Resident DCC '{}' (v: {:?}, PID: {}) is Ready!",
                    dcc_name, dcc_version, guest_pid
                );
            }
            Ok(Some(other)) => {
                let _ = job_object.terminate(1);
                bail!("[DccPool] Unexpected initial message from resident DCC: {:?}", other);
            }
            Ok(None) => {
                let _ = job_object.terminate(1);
                bail!("[DccPool] Resident DCC control pipe closed before Ready handshake");
            }
            Err(_) => {
                let _ = job_object.terminate(1);
                bail!("[DccPool] Timed out (120s) waiting for resident DCC engine initialization");
            }
        }

        let session = DccSession {
            key: key.clone(),
            executor: executor_name.to_string(),
            project_path: project_path.map(|s| s.to_string()),
            pid,
            job_object: Arc::clone(&job_object),
            control_pipe: Arc::clone(&control_pipe),
            resident_rx: Arc::clone(&resident_rx_arc),
            started_at: Instant::now(),
            started_at_sys: SystemTime::now(),
            last_used_at: Instant::now(),
            keep_alive,
            state: SessionState::Busy,
        };

        {
            let mut guard = self.sessions.lock().await;
            guard.insert(key.clone(), session);
        }

        Self::write_snapshot_file(&self.sessions, &self.data_dir).await;

        Ok((key, control_pipe, resident_rx_arc, job_object))
    }

    /// Releases a session after Stage execution. If unhealthy, terminates and evicts it.
    pub async fn release(&self, key: &str, healthy: bool) {
        let mut guard = self.sessions.lock().await;
        if let Some(session) = guard.get_mut(key) {
            if healthy && session.is_alive() {
                session.state = SessionState::Idle;
                session.last_used_at = Instant::now();
                info!(
                    "[DccPool] Released resident session {} (PID {}). State: Idle, keep_alive: {:?}",
                    key, session.pid, session.keep_alive
                );
            } else {
                warn!("[DccPool] Session {} reported unhealthy or exited. Terminating Job Object...", key);
                let _ = session.job_object.terminate(1);
                guard.remove(key);
            }
        }
        Self::write_snapshot_file(&self.sessions, &self.data_dir).await;
    }

    /// Stops and removes any warm sessions belonging to the same executor with a different key.
    pub async fn stop_other_executor_sessions(&self, executor_name: &str, current_key: &str) {
        let mut to_terminate = Vec::new();
        {
            let mut guard = self.sessions.lock().await;
            let mut remove_keys = Vec::new();
            for (key, session) in guard.iter() {
                if key != current_key && session.executor.eq_ignore_ascii_case(executor_name) {
                    info!(
                        "[DccPool] Evicting previous warm session {} for executor '{}' (PID {})",
                        key, executor_name, session.pid
                    );
                    to_terminate.push((Arc::clone(&session.control_pipe), Arc::clone(&session.job_object)));
                    remove_keys.push(key.clone());
                }
            }
            for k in remove_keys {
                guard.remove(&k);
            }
        }

        for (pipe, job) in to_terminate {
            let _ = pipe.send(&HostToResidentMessage::Shutdown).await;
            tokio::time::sleep(Duration::from_millis(500)).await;
            let _ = job.terminate(0);
        }
    }

    /// Stops a specific warm session by key.
    pub async fn stop(&self, key: &str) -> bool {
        let item = {
            let mut guard = self.sessions.lock().await;
            guard.remove(key)
        };

        if let Some(session) = item {
            info!("[DccPool] Stopping warm DCC session {} (PID {})...", key, session.pid);
            let _ = session.control_pipe.send(&HostToResidentMessage::Shutdown).await;
            tokio::time::sleep(Duration::from_millis(500)).await;
            let _ = session.job_object.terminate(0);
            Self::write_snapshot_file(&self.sessions, &self.data_dir).await;
            true
        } else {
            false
        }
    }

    /// Stops all warm DCC sessions.
    pub async fn stop_all(&self) -> usize {
        let items = {
            let mut guard = self.sessions.lock().await;
            let all = guard.drain().collect::<Vec<_>>();
            all
        };

        let count = items.len();
        for (key, session) in items {
            info!("[DccPool] Stopping warm DCC session {} (PID {})...", key, session.pid);
            let _ = session.control_pipe.send(&HostToResidentMessage::Shutdown).await;
            tokio::time::sleep(Duration::from_millis(300)).await;
            let _ = session.job_object.terminate(0);
        }

        Self::write_snapshot_file(&self.sessions, &self.data_dir).await;
        count
    }

    /// Returns list of active sessions.
    pub async fn list(&self) -> Vec<DccSessionInfo> {
        let guard = self.sessions.lock().await;
        guard.values().map(|s| s.to_info()).collect()
    }

    /// Writes active sessions snapshot to `{data_dir}/dcc-sessions.json`.
    async fn write_snapshot_file(sessions: &Arc<Mutex<HashMap<String, DccSession>>>, data_dir: &Path) {
        let infos: Vec<DccSessionInfo> = {
            let guard = sessions.lock().await;
            guard.values().map(|s| s.to_info()).collect()
        };

        let file_path = data_dir.join("dcc-sessions.json");
        if let Ok(bytes) = serde_json::to_vec_pretty(&infos) {
            let _ = tokio::fs::write(&file_path, bytes).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_dcc_session_key_consistency() {
        let exe1 = Path::new("C:/Unreal/UnrealEditor-Cmd.exe");
        let exe2 = Path::new("c:\\unreal\\unrealeditor-cmd.exe");
        let proj1 = Some("D:/Game/MyProject.uproject");
        let proj2 = Some("d:\\game\\myproject.uproject");

        let key1 = compute_dcc_session_key(exe1, proj1);
        let key2 = compute_dcc_session_key(exe2, proj2);

        assert_eq!(key1, key2);
        assert_eq!(key1.len(), 12);
    }
}


