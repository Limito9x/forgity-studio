use anyhow::Result;

use super::{DccExecutor, ExecutionContext};
use crate::core::contracts::StageTaskMessage;

pub struct BlenderExecutor;

impl DccExecutor for BlenderExecutor {
    fn name(&self) -> &'static str {
        "blender"
    }

    fn validate(&self, _task: &StageTaskMessage) -> Result<()> {
        // Blender headless does not strictly require an existing project file up-front.
        Ok(())
    }

    fn build_args(&self, _task: &StageTaskMessage, ctx: &ExecutionContext) -> Result<Vec<String>> {
        let mut args = Vec::new();
        // -b: Background / headless mode
        args.push("-b".to_string());
        // --python: Python script to execute upon startup
        args.push("--python".to_string());
        args.push(ctx.guest_script_path.to_string_lossy().to_string());
        // --: Separates Blender CLI flags from script CLI arguments
        args.push("--".to_string());
        args.push("--pipe".to_string());
        args.push(ctx.pipe_path.clone());
        args.push("--task".to_string());
        args.push(ctx.task_json_path.to_string_lossy().to_string());

        Ok(args)
    }
}
