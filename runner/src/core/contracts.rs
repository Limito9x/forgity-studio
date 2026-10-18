use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepExecutionParam {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepInputMapping {
    pub pin_key: String,
    #[serde(default)]
    pub source_kind: String, // "start_input" | "node_output" | "literal"
    pub source_node_id: Option<String>,
    #[serde(default)]
    pub source_pin_key: String,
    pub literal_value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepExecution {
    pub step_execution_id: String,
    #[serde(default)]
    pub step_type: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub script_path: String,
    pub script_url: Option<String>,
    pub script_hash: Option<String>,
    pub entry_point: Option<String>,
    #[serde(default)]
    pub arguments: String,
    #[serde(default)]
    pub order: i32,
    #[serde(default)]
    pub input_mappings: Vec<StepInputMapping>,
    #[serde(default)]
    pub params: Vec<StepExecutionParam>,
    #[serde(default)]
    pub inputs: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub outputs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageTaskMessage {
    pub stage_execution_id: String,
    pub pipeline_execution_id: String,
    #[serde(default)]
    pub pipeline_id: String,
    #[serde(default)]
    pub stage_id: String,
    pub executor: String, // "blender" | "unreal" | "python"
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub grpc_endpoint: String,
    #[serde(default)]
    pub steps: Vec<StepExecution>,
    #[serde(default)]
    pub resolved_data: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub environment_config: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepProgressMessage {
    pub pipeline_execution_id: String,
    #[serde(default)]
    pub pipeline_id: String,
    pub stage_execution_id: String,
    pub step_execution_id: String,
    pub status: String, // "Running" | "Succeeded" | "Failed" | "Cancelled"
    pub outputs: Option<HashMap<String, serde_json::Value>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_execution_id: String,
    pub succeeded: bool,
    pub log: Option<String>,
    pub error_message: Option<String>,
    #[serde(default)]
    pub outputs: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageResultMessage {
    pub stage_execution_id: String,
    #[serde(default)]
    pub pipeline_execution_id: String,
    #[serde(default)]
    pub pipeline_id: String,
    pub succeeded: bool,
    pub log: Option<String>,
    pub error_message: Option<String>,
    #[serde(default)]
    pub step_results: Vec<StepResult>,
}
