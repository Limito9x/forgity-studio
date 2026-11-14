use anyhow::{Context, Result};
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::dag::DagPipelineDocument;
use super::traits::{ResolvedScript, ResourceResolver};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawScriptJson {
    #[serde(default)]
    full_path: Option<String>,
    #[serde(default)]
    relative_path: Option<String>,
    #[serde(default)]
    executor: Option<String>,
    #[serde(default)]
    inputs: Vec<RawPinDef>,
    #[serde(default)]
    dependencies: Vec<RawDependency>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPinDef {
    id: String,
    #[serde(default)]
    default_value: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDependency {
    #[serde(default)]
    package_name: Option<String>,
    #[serde(default)]
    module: Option<String>,
}

/// Đọc metadata từ `<workspace_root>/.forgity/workspace.db` (read-only) để resolve script, component YAML và constants.
pub struct WorkspaceResolver {
    workspace_root: PathBuf,
    db_path: PathBuf,
}

impl WorkspaceResolver {
    pub fn new(workspace_root: impl AsRef<Path>) -> Result<Self> {
        let root = workspace_root.as_ref().to_path_buf();
        let db_path = root.join(".forgity").join("workspace.db");
        if !db_path.exists() {
            anyhow::bail!(
                "Workspace SQLite index not found at {:?}. Open the workspace in Forgity Studio first to index scripts and pipelines.",
                db_path
            );
        }
        Ok(Self {
            workspace_root: root,
            db_path,
        })
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    fn open_readonly(&self) -> Result<Connection> {
        Connection::open_with_flags(
            &self.db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("Failed to open workspace.db at {:?}", self.db_path))
    }

    /// Resolve 1 script tool (`local:script:<key>` hoặc `<key>`) thành đường dẫn `.py` trên đĩa + executor + requirements.
    pub fn resolve_script(&self, tool_ref: &str) -> Result<ResolvedScript> {
        let key = tool_ref.strip_prefix("local:script:").unwrap_or(tool_ref);
        let conn = self.open_readonly()?;

        let (raw_json, db_executor): (String, String) = conn
            .query_row(
                "SELECT raw_json, executor FROM local_scripts WHERE key = ?1 LIMIT 1",
                [key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .with_context(|| format!("Script '{}' not found in local_scripts table", key))?;

        let parsed: RawScriptJson = serde_json::from_str(&raw_json)
            .with_context(|| format!("Failed to parse raw_json for script '{}'", key))?;

        let script_path = if let Some(full) = parsed.full_path.filter(|s| !s.is_empty()) {
            let p = PathBuf::from(&full);
            if p.is_absolute() {
                p
            } else {
                self.workspace_root.join(p)
            }
        } else if let Some(rel) = parsed.relative_path.filter(|s| !s.is_empty()) {
            self.workspace_root.join(rel)
        } else {
            anyhow::bail!("Script '{}' has no full_path or relative_path in workspace.db", key);
        };

        let executor = parsed
            .executor
            .filter(|s| !s.is_empty())
            .unwrap_or(db_executor);

        let mut default_inputs = HashMap::new();
        for pin in parsed.inputs {
            if let Some(val) = pin.default_value {
                default_inputs.insert(pin.id, val);
            }
        }

        let requirements = parsed
            .dependencies
            .into_iter()
            .filter_map(|d| {
                d.package_name
                    .filter(|s| !s.is_empty())
                    .or(d.module.filter(|s| !s.is_empty()))
            })
            .collect();

        Ok(ResolvedScript {
            key: key.to_string(),
            executor,
            full_path: script_path,
            requirements,
            default_inputs,
        })
    }

    /// Resolve 1 Component Pipe (`local:component:<slug>` hoặc `<slug>`) và đọc file `*.component.yaml`.
    pub fn resolve_component(&self, component_ref: &str) -> Result<(PathBuf, DagPipelineDocument)> {
        let slug = component_ref
            .strip_prefix("local:component:")
            .unwrap_or(component_ref);

        let conn = self.open_readonly()?;
        let (full_path, relative_path): (String, String) = conn
            .query_row(
                "SELECT full_path, relative_path FROM local_pipelines WHERE slug = ?1 LIMIT 1",
                [slug],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .with_context(|| format!("Component pipeline '{}' not found in local_pipelines table", slug))?;

        let candidate = PathBuf::from(&full_path);
        let resolved_path = if candidate.exists() {
            candidate
        } else {
            self.workspace_root.join(&relative_path)
        };

        let yaml_content = std::fs::read_to_string(&resolved_path).with_context(|| {
            format!(
                "Failed to read component YAML for '{}' at {:?}",
                slug, resolved_path
            )
        })?;

        let doc: DagPipelineDocument = serde_yaml::from_str(&yaml_content).with_context(|| {
            format!(
                "Failed to parse component YAML '{}' at {:?}",
                slug, resolved_path
            )
        })?;

        Ok((resolved_path, doc))
    }

    /// Tra giá trị mặc định của 1 Local Constant (`local:constant:<key>` hoặc `<key>`) từ `local_constants`.
    pub fn resolve_constant(&self, constant_ref: &str) -> Result<Option<Value>> {
        let key = constant_ref
            .strip_prefix("local:constant:")
            .unwrap_or(constant_ref);

        let conn = self.open_readonly()?;
        let res: rusqlite::Result<String> = conn.query_row(
            "SELECT value_json FROM local_constants WHERE key = ?1 OR id = ?1 LIMIT 1",
            [key],
            |row| row.get(0),
        );

        match res {
            Ok(json_str) => {
                let val: Value = serde_json::from_str(&json_str).with_context(|| {
                    format!("Failed to parse value_json for constant '{}'", key)
                })?;
                Ok(Some(val))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e).with_context(|| format!("Failed to query constant '{}'", key)),
        }
    }
}

impl ResourceResolver for WorkspaceResolver {
    fn resolve_script(&self, tool_ref: &str) -> Result<ResolvedScript> {
        WorkspaceResolver::resolve_script(self, tool_ref)
    }

    fn resolve_component(&self, component_ref: &str) -> Result<DagPipelineDocument> {
        let (_, doc) = WorkspaceResolver::resolve_component(self, component_ref)?;
        Ok(doc)
    }

    fn resolve_constant(&self, constant_ref: &str) -> Result<Option<Value>> {
        WorkspaceResolver::resolve_constant(self, constant_ref)
    }
}
