use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use super::dag::DagPipelineDocument;
use super::traits::{ResolvedConstantSpec, ResolvedScript, ResourceResolver};

/// DTO tự chứa (Self-contained) do Local Client (Tauri) hoặc Cloud đóng gói gửi sang cho Runner thực thi.
/// Runner chỉ cần nhận DTO này là chạy được ngay mà không cần biết SQLite hay cấu trúc thư mục workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionBundle {
    #[serde(default = "default_bundle_version")]
    pub bundle_version: u32,
    #[serde(default)]
    pub run_id: Option<String>,
    /// "component" | "master"
    #[serde(default = "default_pipeline_kind")]
    pub pipeline_kind: String,
    pub root_pipeline: DagPipelineDocument,
    #[serde(default)]
    pub runtime_inputs: HashMap<String, Value>,
    #[serde(default)]
    pub scripts: HashMap<String, ResolvedScript>,
    #[serde(default)]
    pub components: HashMap<String, DagPipelineDocument>,
    #[serde(default)]
    pub constants: HashMap<String, ResolvedConstantSpec>,
}

fn default_bundle_version() -> u32 {
    1
}

fn default_pipeline_kind() -> String {
    "master".to_string()
}

/// Bộ tiếp nhận DTO `ExecutionBundle` vào RAM để phục vụ `ComponentOrchestrator` & `MasterOrchestrator` tra cứu O(1).
pub struct BundleResourceResolver {
    scripts: HashMap<String, ResolvedScript>,
    components: HashMap<String, DagPipelineDocument>,
    constants: HashMap<String, ResolvedConstantSpec>,
}

impl BundleResourceResolver {
    pub fn from_bundle(bundle: &ExecutionBundle) -> Self {
        Self {
            scripts: bundle.scripts.clone(),
            components: bundle.components.clone(),
            constants: bundle.constants.clone(),
        }
    }
}

impl ResourceResolver for BundleResourceResolver {
    fn resolve_script(&self, tool_ref: &str) -> Result<ResolvedScript> {
        let bare = tool_ref
            .strip_prefix("local:script:")
            .or_else(|| tool_ref.strip_prefix("local:"))
            .unwrap_or(tool_ref);
        self.scripts
            .get(tool_ref)
            .or_else(|| self.scripts.get(bare))
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Script '{}' not found in ExecutionBundle", tool_ref))
    }

    fn resolve_component(&self, component_ref: &str) -> Result<DagPipelineDocument> {
        let bare = component_ref
            .strip_prefix("local:component:")
            .or_else(|| component_ref.strip_prefix("local:"))
            .unwrap_or(component_ref);
        self.components
            .get(component_ref)
            .or_else(|| self.components.get(bare))
            .cloned()
            .ok_or_else(|| {
                anyhow::anyhow!("Component '{}' not found in ExecutionBundle", component_ref)
            })
    }

    fn resolve_constant_spec(&self, constant_ref: &str) -> Result<Option<ResolvedConstantSpec>> {
        let bare = constant_ref
            .strip_prefix("local:constant:")
            .or_else(|| constant_ref.strip_prefix("local:"))
            .unwrap_or(constant_ref);
        Ok(self
            .constants
            .get(constant_ref)
            .or_else(|| self.constants.get(bare))
            .cloned())
    }
}
