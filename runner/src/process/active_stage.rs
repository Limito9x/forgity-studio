use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tracing::{info, warn};

use super::job_object::JobObject;

pub struct ActiveStageInfo {
    pub stage_execution_id: String,
    pub pipeline_execution_id: String,
    pub cancel_tx: broadcast::Sender<()>,
    pub job_object: Arc<JobObject>,
}

#[derive(Clone, Default)]
pub struct ActiveStageManager {
    inner: Arc<Mutex<HashMap<String, ActiveStageInfo>>>,
}

impl ActiveStageManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register(
        &self,
        stage_execution_id: String,
        pipeline_execution_id: String,
        cancel_tx: broadcast::Sender<()>,
        job_object: Arc<JobObject>,
    ) {
        let mut guard = self.inner.lock().await;
        guard.insert(
            stage_execution_id.clone(),
            ActiveStageInfo {
                stage_execution_id: stage_execution_id.clone(),
                pipeline_execution_id,
                cancel_tx,
                job_object,
            },
        );
        info!(
            "[ActiveStageManager] Registered active stage {} (total active: {})",
            stage_execution_id,
            guard.len()
        );
    }

    pub async fn unregister(&self, stage_execution_id: &str) {
        let mut guard = self.inner.lock().await;
        if guard.remove(stage_execution_id).is_some() {
            info!(
                "[ActiveStageManager] Unregistered active stage {} (remaining active: {})",
                stage_execution_id,
                guard.len()
            );
        }
    }

    /// Attempts to cancel all active stage executions matching the pipeline_id or stage_id.
    /// If both are empty, cancels all currently active stages.
    /// Returns true if at least one running stage was found and terminated.
    pub async fn cancel_active_stage(
        &self,
        pipeline_execution_id: &str,
        stage_execution_id: &str,
    ) -> (bool, String) {
        let mut guard = self.inner.lock().await;
        let matching_keys: Vec<String> = guard
            .iter()
            .filter(|(_, active)| {
                let matches_pipeline = pipeline_execution_id.is_empty()
                    || active.pipeline_execution_id.eq_ignore_ascii_case(pipeline_execution_id);
                let matches_stage = stage_execution_id.is_empty()
                    || active.stage_execution_id.eq_ignore_ascii_case(stage_execution_id);
                matches_pipeline && matches_stage
            })
            .map(|(k, _)| k.clone())
            .collect();

        if !matching_keys.is_empty() {
            let mut messages = Vec::new();
            for key in matching_keys {
                if let Some(active) = guard.remove(&key) {
                    info!(
                        "[ActiveStageManager] Matched active stage {} for cancellation. Terminating Job Object...",
                        active.stage_execution_id
                    );
                    let term_res = active.job_object.terminate(1);
                    let _ = active.cancel_tx.send(());
                    let msg = match term_res {
                        Ok(_) => format!("Terminated active stage subprocess {}", active.stage_execution_id),
                        Err(e) => format!("Signaled stage cancel with warning: {}", e),
                    };
                    messages.push(msg);
                }
            }
            return (true, messages.join("; "));
        }

        if !guard.is_empty() {
            warn!(
                "[ActiveStageManager] No active stage matched requested (pipe: {}, stage: {}), {} active stage(s) remain",
                pipeline_execution_id,
                stage_execution_id,
                guard.len()
            );
        }

        (false, "No matching active stage found on this runner.".to_string())
    }
}
