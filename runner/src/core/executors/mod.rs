use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use crate::core::contracts::StageTaskMessage;

pub mod blender;
pub mod python;
pub mod unreal;

/// Context passed to DCC executors containing shared environment paths.
pub struct ExecutionContext {
    pub guest_script_path: PathBuf,
    pub task_json_path: PathBuf,
    pub pipe_path: String,
    pub exe_path: PathBuf,
}

/// Strategy trait for executing tasks inside different DCCs (Blender, Unreal, Maya, Python, etc.)
pub trait DccExecutor: Send + Sync {
    /// Identifier of the DCC / runtime (e.g. "blender", "unreal", "python")
    fn name(&self) -> &'static str;

    /// Validates prerequisite configurations (project paths, assets, plugins) before spawning.
    /// Provides early fail-fast feedback instead of crashing after process spawn.
    fn validate(&self, task: &StageTaskMessage) -> Result<()>;

    /// Builds command-line arguments to launch the DCC host process with the guest script.
    fn build_args(&self, task: &StageTaskMessage, ctx: &ExecutionContext) -> Result<Vec<String>>;

    /// Prepares executor-specific environment variables (e.g. UE_STAGE_TASK_FILE, PYTHONPATH).
    fn prepare_env(
        &self,
        _task: &StageTaskMessage,
        _ctx: &ExecutionContext,
    ) -> Result<HashMap<String, String>> {
        Ok(HashMap::new())
    }

    /// Cleans up any executor-specific temporary files or allocations after execution.
    fn cleanup(&self, _task: &StageTaskMessage) -> Result<()> {
        Ok(())
    }
}

/// Registry mapping executor names to their respective Strategy implementation.
pub struct ExecutorRegistry {
    executors: HashMap<String, Arc<dyn DccExecutor>>,
}

impl Default for ExecutorRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ExecutorRegistry {
    pub fn new() -> Self {
        let mut reg = Self {
            executors: HashMap::new(),
        };
        reg.register(Arc::new(blender::BlenderExecutor));
        reg.register(Arc::new(unreal::UnrealExecutor));
        reg.register(Arc::new(python::PythonExecutor));
        reg
    }

    pub fn register(&mut self, executor: Arc<dyn DccExecutor>) {
        self.executors.insert(executor.name().to_lowercase(), executor);
    }

    pub fn get(&self, name: &str) -> Result<Arc<dyn DccExecutor>> {
        let key = name.to_lowercase();
        self.executors
            .get(&key)
            .cloned()
            .ok_or_else(|| {
                let available: Vec<&str> = self.executors.keys().map(|s| s.as_str()).collect();
                anyhow!(
                    "Unsupported executor '{}'. Available registered executors: {:?}",
                    name,
                    available
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn mock_context() -> ExecutionContext {
        ExecutionContext {
            guest_script_path: PathBuf::from(r"\\?\D:\Games\Scripts\stage_runner_guest.py"),
            task_json_path: PathBuf::from(r"D:\Games\Temp\task.json"),
            pipe_path: r"\\.\pipe\test-ipc".to_string(),
            exe_path: PathBuf::from(r"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe"),
        }
    }

    fn mock_task(executor: &str) -> StageTaskMessage {
        StageTaskMessage {
            stage_execution_id: "test_stage_1".to_string(),
            pipeline_execution_id: "test_pipe_1".to_string(),
            pipeline_id: "pipe_1".to_string(),
            stage_id: "stage_1".to_string(),
            executor: executor.to_string(),
            access_token: "mock_token".to_string(),
            grpc_endpoint: "http://localhost:50051".to_string(),
            environment_config: HashMap::new(),
            site_packages_path: None,
            steps: vec![],
            resolved_data: HashMap::new(),
        }
    }

    #[test]
    fn test_registry_lookup_case_insensitive() {
        let registry = ExecutorRegistry::new();
        assert!(registry.get("blender").is_ok());
        assert!(registry.get("Blender").is_ok());
        assert!(registry.get("UNREAL").is_ok());
        assert!(registry.get("unreal").is_ok());
        assert!(registry.get("python").is_ok());
        assert!(registry.get("maya").is_err());
    }

    #[test]
    fn test_blender_build_args() {
        let executor = blender::BlenderExecutor;
        let task = mock_task("blender");
        let ctx = mock_context();

        let args = executor.build_args(&task, &ctx).expect("Blender build_args should succeed");
        assert_eq!(args[0], "-b");
        assert_eq!(args[1], "--python");
        assert_eq!(args[3], "--");
        assert_eq!(args[4], "--pipe");
        assert_eq!(args[5], r"\\.\pipe\test-ipc");
        assert_eq!(args[6], "--task");
    }

    #[test]
    fn test_unreal_build_args_and_clean_path() {
        let executor = unreal::UnrealExecutor;
        let mut task = mock_task("unreal");
        task.environment_config.insert(
            "fullPathProject".to_string(),
            serde_json::Value::String(r"D:/Games/Projects/Test.uproject".to_string()),
        );

        let ctx = mock_context();
        let args = executor.build_args(&task, &ctx).expect("Unreal build_args should succeed");

        // First arg is project
        assert_eq!(args[0], "D:/Games/Projects/Test.uproject");
        // Second arg MUST be -run=pythonscript (not ExecutePythonScript!)
        assert_eq!(args[1], "-run=pythonscript");
        // Script path must NOT have \\?\ verbatim prefix
        assert!(!args[2].contains(r"\\?\"));
        assert!(args[2].starts_with("-script=D:/Games/Scripts/stage_runner_guest.py"));
        // Required flags for headless execution
        assert!(args.contains(&"-stdout".to_string()));
        assert!(args.contains(&"-FullStdOutLogOutput".to_string()));
        assert!(args.contains(&"-UTF8Output".to_string()));
        assert!(args.contains(&"-nullrhi".to_string()));
        assert!(args.contains(&"-unattended".to_string()));
        assert!(args.contains(&"-nosplash".to_string()));
    }

    #[test]
    fn test_unreal_validation_fails_on_nonexistent_project() {
        let executor = unreal::UnrealExecutor;
        let mut task = mock_task("unreal");
        task.environment_config.insert(
            "fullPathProject".to_string(),
            serde_json::Value::String(r"Z:\NonExistentDirectory\Fake.uproject".to_string()),
        );

        let result = executor.validate(&task);
        assert!(result.is_err(), "Validation should fail for non-existent .uproject");
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Unreal .uproject file does not exist at"));
    }

    #[test]
    fn test_python_build_args() {
        let executor = python::PythonExecutor;
        let task = mock_task("python");
        let ctx = mock_context();

        let args = executor.build_args(&task, &ctx).expect("Python build_args should succeed");
        assert_eq!(args[1], "--pipe");
        assert_eq!(args[3], "--task");
    }
}
