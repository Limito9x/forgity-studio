use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Messages emitted from the Guest DCC Subprocess (Blender/Unreal/Python) to the Host Runner.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GuestToHostMessage {
    /// Guest subprocess has started and established pipe connection
    Handshake {
        dcc_name: String,
        dcc_version: Option<String>,
        pid: u32,
    },
    /// A step within the stage has started execution
    StepStarted {
        step_execution_id: String,
        #[serde(default)]
        step_index: usize,
    },
    /// Step execution progress update
    StepProgress {
        step_execution_id: String,
        status: String, // "Running" | "Succeeded" | "Failed"
        #[serde(default)]
        progress: f32, // 0.0 -> 1.0
        #[serde(default)]
        message: Option<String>,
        #[serde(default)]
        outputs: Option<HashMap<String, serde_json::Value>>,
    },
    /// Step finished execution
    StepCompleted {
        step_execution_id: String,
        succeeded: bool,
        #[serde(default)]
        outputs: HashMap<String, serde_json::Value>,
        #[serde(default)]
        error_message: Option<String>,
        #[serde(default)]
        log: Option<String>,
    },
    /// Subprocess asks Host Daemon to provide an asset path (on-demand download)
    FetchAssetRequest {
        request_id: String,
        asset_id: String,
        #[serde(default)]
        pin_key: Option<String>,
    },
    /// Stage completed entirely inside the guest
    StageCompleted {
        succeeded: bool,
        #[serde(default)]
        error_message: Option<String>,
    },
}

/// Messages emitted from the Host Runner to the Guest DCC Subprocess.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HostToGuestMessage {
    HandshakeAck {
        runner_version: String,
        stage_execution_id: String,
    },
    FetchAssetResponse {
        request_id: String,
        success: bool,
        #[serde(default)]
        local_path: Option<String>,
        #[serde(default)]
        error: Option<String>,
    },
    CancelStage {
        reason: String,
    },
}
