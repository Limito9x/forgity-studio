use anyhow::Result;

use super::{DccExecutor, ExecutionContext};
use crate::core::contracts::StageTaskMessage;

pub struct PythonExecutor;

impl DccExecutor for PythonExecutor {
    fn name(&self) -> &'static str {
        "python"
    }

    fn validate(&self, _task: &StageTaskMessage) -> Result<()> {
        Ok(())
    }

    fn build_args(&self, _task: &StageTaskMessage, ctx: &ExecutionContext) -> Result<Vec<String>> {
        let mut args = Vec::new();
        args.push(ctx.guest_script_path.to_string_lossy().to_string());
        args.push("--pipe".to_string());
        args.push(ctx.pipe_path.clone());
        args.push("--task".to_string());
        args.push(ctx.task_json_path.to_string_lossy().to_string());

        Ok(args)
    }
}
