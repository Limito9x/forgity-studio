use anyhow::{bail, Result};
use std::path::Path;
use tracing::{info, warn};

use super::{DccExecutor, ExecutionContext};
use crate::core::contracts::StageTaskMessage;

pub struct UnrealExecutor;

impl UnrealExecutor {
    /// Extracts the target Unreal Engine project path (.uproject) from environment_config
    pub fn resolve_project_path<'a>(&self, task: &'a StageTaskMessage) -> Option<&'a str> {
        task.environment_config
            .get("fullPathProject")
            .or_else(|| task.environment_config.get("full_path_project"))
            .or_else(|| task.environment_config.get("projectPath"))
            .or_else(|| task.environment_config.get("project_path"))
            .or_else(|| task.environment_config.get("uproject_path"))
            .or_else(|| task.environment_config.get("ProjectPath"))
            .and_then(|v| v.as_str())
    }
}

impl DccExecutor for UnrealExecutor {
    fn name(&self) -> &'static str {
        "unreal"
    }

    fn validate(&self, task: &StageTaskMessage) -> Result<()> {
        let proj = self.resolve_project_path(task);
        match proj {
            Some(raw_path) => {
                let trimmed = raw_path.trim().trim_matches('"');
                if trimmed.is_empty() {
                    bail!(
                        "UnrealEngine executor requires a valid .uproject path, but an empty string was provided in 'fullPathProject'."
                    );
                }
                let path = Path::new(trimmed);
                if !path.is_file() {
                    bail!(
                        "Unreal .uproject file does not exist at: '{}'. Please check your Runner Unreal Engine project settings.",
                        trimmed
                    );
                }
            }
            None => {
                warn!(
                    "[UnrealExecutor] No .uproject path configured in environment_config for Stage {}. Running Unreal in standalone commandlet mode without project context.",
                    task.stage_execution_id
                );
            }
        }
        Ok(())
    }

    fn build_args(&self, task: &StageTaskMessage, ctx: &ExecutionContext) -> Result<Vec<String>> {
        let mut args = Vec::new();

        // 1. Target .uproject path MUST be the very first argument if specified
        if let Some(raw_path) = self.resolve_project_path(task) {
            let trimmed = raw_path.trim().trim_matches('"');
            if !trimmed.is_empty() {
                info!("[UnrealExecutor] Target Unreal Project: {}", trimmed);
                args.push(trimmed.to_string());
            }
        }

        // 2. Commandlet execution arguments
        // Unreal Engine's Python plugin defines `UPythonScriptCommandlet`, which matches CLI name `-run=pythonscript`
        args.push("-run=pythonscript".to_string());

        let clean_script = ctx
            .guest_script_path
            .to_string_lossy()
            .replace(r"\\?\", "")
            .replace('\\', "/");
        args.push(format!("-script={}", clean_script));

        args.push("-stdout".to_string());
        args.push("-FullStdOutLogOutput".to_string());
        args.push("-UTF8Output".to_string());
        args.push("-nullrhi".to_string());
        args.push("-unattended".to_string());
        args.push("-nosplash".to_string());

        Ok(args)
    }
}
