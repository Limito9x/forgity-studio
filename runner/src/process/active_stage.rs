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
    inner: Arc<Mutex<Option<ActiveStageInfo>>>,
}

impl ActiveStageManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
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
        *guard = Some(ActiveStageInfo {
            stage_execution_id,
            pipeline_execution_id,
            cancel_tx,
            job_object,
        });
        info!("[ActiveStageManager] Registered active stage execution");
    }

    pub async fn unregister(&self, stage_execution_id: &str) {
        let mut guard = self.inner.lock().await;
        if let Some(active) = &*guard {
            if active.stage_execution_id == stage_execution_id {
                *guard = None;
                info!("[ActiveStageManager] Unregistered active stage {}", stage_execution_id);
            }
        }
    }

    /// Attempts to cancel the active stage execution if it matches the pipeline_id or stage_id.
    /// If both are empty, cancels whatever stage is currently active.
    /// Returns true if a running stage was found and terminated.
    pub async fn cancel_active_stage(
        &self,
        pipeline_execution_id: &str,
        stage_execution_id: &str,
    ) -> (bool, String) {
        let mut guard = self.inner.lock().await;
        if let Some(active) = &*guard {
            let matches_pipeline = pipeline_execution_id.is_empty()
                || active.pipeline_execution_id.eq_ignore_ascii_case(pipeline_execution_id);
            let matches_stage = stage_execution_id.is_empty()
                || active.stage_execution_id.eq_ignore_ascii_case(stage_execution_id);

            if matches_pipeline || matches_stage {
                info!(
                    "[ActiveStageManager] Matched active stage {} for cancellation. Terminating Job Object...",
                    active.stage_execution_id
                );
                // 1. Terminate Job Object (kills Blender/UE subprocess tree immediately)
                let term_res = active.job_object.terminate(1);
                // 2. Broadcast cancellation to the dispatcher loop
                let _ = active.cancel_tx.send(());

                let msg = match term_res {
                    Ok(_) => format!("Terminated active stage subprocess {}", active.stage_execution_id),
                    Err(e) => format!("Signaled stage cancel with warning: {}", e),
                };

                *guard = None;
                return (true, msg);
            } else {
                warn!(
                    "[ActiveStageManager] Active stage (pipe: {}, stage: {}) did not match requested (pipe: {}, stage: {})",
                    active.pipeline_execution_id, active.stage_execution_id, pipeline_execution_id, stage_execution_id
                );
            }
        }

        (false, "No matching active stage found on this runner.".to_string())
    }
}
