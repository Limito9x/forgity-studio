use anyhow::Result;
use async_trait::async_trait;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

use super::dag::DagPipelineDocument;
use super::traits::{QuotaGate, ResolvedConstantSpec, ResolvedScript, ResourceResolver};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudLeaseConfig {
    #[serde(default)]
    pub api_url: Option<String>,
    pub template_view_id: String,
    pub pipeline_version_id: String,
    pub machine_key: String,
    #[serde(default)]
    pub lease_token: Option<String>,
}

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
    #[serde(default)]
    pub cloud_lease: Option<CloudLeaseConfig>,
}

fn default_bundle_version() -> u32 {
    1
}

fn default_pipeline_kind() -> String {
    "master".to_string()
}

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

#[async_trait]
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

/// QuotaGate for Cloud Templates: deducts quota per component run via Backend API.
pub struct CloudTemplateQuotaGate {
    api_url: String,
    lease: CloudLeaseConfig,
    http: reqwest::Client,
}

impl CloudTemplateQuotaGate {
    pub fn new(api_url: String, lease: CloudLeaseConfig) -> Self {
        Self {
            api_url: api_url.trim_end_matches('/').to_string(),
            lease,
            http: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl QuotaGate for CloudTemplateQuotaGate {
    async fn check_and_consume(&self, unit_count: usize) -> Result<()> {
        if unit_count == 0 {
            return Ok(());
        }
        let url = format!("{}/api/templates/consume-quota", self.api_url);
        let resp = self
            .http
            .post(&url)
            .json(&serde_json::json!({
                "templateViewId": self.lease.template_view_id,
                "machineKey": self.lease.machine_key,
                "count": unit_count,
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Template quota check failed ({}): {}", status, text);
        }
        Ok(())
    }
}

/// ResourceResolver for Cloud Templates: wraps BundleResourceResolver and fetches missing
/// script source code into an in-RAM DashMap cache without writing .py files to disk.
pub struct CloudTemplateResourceResolver {
    inner: BundleResourceResolver,
    api_url: String,
    lease: CloudLeaseConfig,
    ram_cache_by_hash: Arc<DashMap<String, String>>,
    http: reqwest::Client,
}

impl CloudTemplateResourceResolver {
    pub fn from_bundle(bundle: &ExecutionBundle, api_url: String, lease: CloudLeaseConfig) -> Self {
        Self {
            inner: BundleResourceResolver::from_bundle(bundle),
            api_url: api_url.trim_end_matches('/').to_string(),
            lease,
            ram_cache_by_hash: Arc::new(DashMap::new()),
            http: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl ResourceResolver for CloudTemplateResourceResolver {
    fn resolve_script(&self, tool_ref: &str) -> Result<ResolvedScript> {
        let mut script = self.inner.resolve_script(tool_ref)?;
        if script.inline_source.is_some() || !script.full_path.as_os_str().is_empty() {
            return Ok(script);
        }

        if let Some(ref hash) = script.content_hash {
            if let Some(cached) = self.ram_cache_by_hash.get(&hash.to_lowercase()) {
                script.inline_source = Some(cached.value().clone());
                return Ok(script);
            }
        }

        anyhow::bail!(
            "Script '{}' (hash: {:?}) was not pre-flight loaded into RAM cache before execution",
            script.key,
            script.content_hash
        );
    }

    fn resolve_component(&self, component_ref: &str) -> Result<DagPipelineDocument> {
        self.inner.resolve_component(component_ref)
    }

    fn resolve_constant_spec(&self, constant_ref: &str) -> Result<Option<ResolvedConstantSpec>> {
        self.inner.resolve_constant_spec(constant_ref)
    }

    async fn preflight_component(&self, doc: &DagPipelineDocument, unit_count: usize) -> Result<()> {
        let mut template_hashes = std::collections::HashSet::new();

        for node in &doc.nodes {
            let tool_lower = node.tool.to_ascii_lowercase();
            if tool_lower == "start"
                || tool_lower == "return"
                || tool_lower.starts_with("local:constant:")
                || tool_lower.starts_with("local:pure:")
                || node.executor.as_deref() == Some("pure")
            {
                continue;
            }

            if let Ok(script) = self.inner.resolve_script(&node.tool) {
                // If script has a valid local file on disk, it's user's local script -> free!
                if !script.full_path.as_os_str().is_empty() && script.full_path.is_file() {
                    continue;
                }
                // If it has a content_hash but no local file, it's a template script -> requires cloud acquire
                if let Some(ref h) = script.content_hash {
                    if !h.trim().is_empty() {
                        template_hashes.insert(h.trim().to_lowercase());
                    }
                }
            }
        }

        if template_hashes.is_empty() {
            return Ok(());
        }

        // Identify which hashes are already in RAM
        let mut already_cached = Vec::new();
        let mut needed_hashes = Vec::new();
        for h in &template_hashes {
            if self.ram_cache_by_hash.contains_key(h) {
                already_cached.push(h.clone());
            } else {
                needed_hashes.push(h.clone());
            }
        }

        let url = format!("{}/api/templates/acquire-component-scripts", self.api_url);
        let resp = self
            .http
            .post(&url)
            .json(&serde_json::json!({
                "templatePackageId": self.lease.template_view_id,
                "pipelineVersionId": if self.lease.pipeline_version_id.is_empty() { None } else { Some(&self.lease.pipeline_version_id) },
                "machineKey": self.lease.machine_key,
                "scriptHashes": template_hashes.into_iter().collect::<Vec<_>>(),
                "unitCount": unit_count,
                "alreadyCachedHashes": already_cached,
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!(
                "Pre-flight template script acquisition failed ({}): {}",
                status,
                text
            );
        }

        let body: Value = resp.json().await?;
        if let Some(scripts_arr) = body.get("scripts").and_then(|v| v.as_array()) {
            use sha2::{Digest, Sha256};
            for item in scripts_arr {
                let returned_hash = item
                    .get("scriptHash")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                let source_code = item
                    .get("sourceCode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                // Strict SHA-256 verification
                let mut hasher = Sha256::new();
                hasher.update(source_code.as_bytes());
                let actual_hash = hex::encode(hasher.finalize()).to_lowercase();

                if !actual_hash.eq_ignore_ascii_case(&returned_hash) {
                    anyhow::bail!(
                        "Template script SHA-256 mismatch! Server returned {}, computed {}",
                        returned_hash,
                        actual_hash
                    );
                }

                self.ram_cache_by_hash.insert(returned_hash, source_code.to_string());
            }
        }

        Ok(())
    }
}

