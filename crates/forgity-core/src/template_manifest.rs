//! Template dependency scanner (BL-057 Phase 0).
//!
//! Canonical source of the pipeline graph is the **SQLite snapshot** (`local_pipelines.snapshot_json`).
//! The YAML draft is always parsed read-only for cross-checking the canonical hash and for
//! metadata that the snapshot does not keep. Nothing is ever written back to YAML.
//!
//! The scanner produces a deterministic [`TemplateDependencyManifest`] used both by the Builder UI
//! preview (Phase 3) and the cloud ingest payload (Phase 1).

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::node_contracts::discover_component_pipelines;
use crate::script_contracts::load_contracts_file;
use crate::workspace_db::{LocalDependencyRow, WorkspaceDb};

const DEFAULT_SCRIPTS_DIR: &str = "pipeline-scripts";
const DEFAULT_MAX_HASH_BYTES: u64 = 64 * 1024 * 1024;
const HASH_BUFFER_BYTES: usize = 64 * 1024;

const PARENT_KIND_PIPELINE: &str = "pipeline";

const KIND_MASTER: &str = "master";
const KIND_COMPONENT: &str = "component";

const GRAPH_SOURCE_SNAPSHOT: &str = "snapshot";
const GRAPH_SOURCE_YAML: &str = "yaml";

const LEVEL_ERROR: &str = "error";
const LEVEL_WARNING: &str = "warning";
const LEVEL_INFO: &str = "info";

const REF_COMPONENT_PREFIX: &str = "local:component:";
const REF_CONSTANT_PREFIX: &str = "local:constant:";
const REF_SCRIPT_PREFIX: &str = "local:";

const BATCH_FLAG_KEYS: &[&str] = &["_isBatch", "_maxConcurrency", "_iterablePin", "_skipOnError"];

const ASSET_EXTENSIONS: &[&str] = &[
    "py", "fbx", "obj", "blend", "duf", "uasset", "umap", "png", "jpg", "jpeg", "exr", "hdr",
    "tga", "bmp", "tif", "tiff", "wav", "mp3", "mp4", "mov", "usd", "usda", "usdc", "abc", "gltf",
    "glb", "zip", "7z", "rar", "txt", "csv", "xlsx", "pdf",
];

const CONFIG_EXTENSIONS: &[&str] = &["yaml", "yml", "json"];

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDependencyManifest {
    pub root_path: String,
    pub generated_at: String,
    pub persisted: bool,
    pub pipelines: Vec<ManifestPipeline>,
    pub scripts: Vec<ManifestScript>,
    pub constants: Vec<ManifestConstant>,
    pub assets: Vec<ManifestAsset>,
    pub diagnostics: Vec<ManifestDiagnostic>,
    pub totals: ManifestTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManifestPipeline {
    pub slug: String,
    pub kind: String,
    pub relative_path: String,
    pub graph_source: String,
    pub graph_hash: String,
    pub depends_on: Vec<String>,
    pub script_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManifestScript {
    pub key: String,
    pub executor: String,
    pub content_hash: String,
    pub source_code: String,
    pub requirements: Vec<String>,
    pub used_by: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManifestConstant {
    pub key: String,
    pub data_type: String,
    pub scope: String,
    pub value_json: String,
    pub used_by: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManifestAsset {
    pub name: String,
    pub relative_path: String,
    pub size_bytes: u64,
    pub hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManifestDiagnostic {
    pub level: String,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pipeline_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ManifestTotals {
    pub master_count: u32,
    pub component_count: u32,
    pub script_count: u32,
    pub constant_count: u32,
    pub asset_count: u32,
    pub asset_bytes: u64,
    pub error_count: u32,
    pub warning_count: u32,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Builds the dependency manifest of the selected pipelines plus their transitive components.
pub fn build_template_dependency_manifest(
    root_path: &Path,
    root_pipeline_paths: &[String],
    persist: bool,
) -> TemplateDependencyManifest {
    let mut scanner = ManifestScanner::new(root_path);
    scanner.run(root_pipeline_paths, persist)
}

// ---------------------------------------------------------------------------
// Canonical graph
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
struct CanonicalNode {
    id: String,
    ref_id: String,
    parent_id: Option<String>,
    config: Map<String, Value>,
    is_batch: bool,
    max_concurrency: Option<i64>,
    iterable_pin: Option<String>,
    skip_on_error: Option<bool>,
    source_path: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct CanonicalEdge {
    from: String,
    to: String,
}

#[derive(Debug, Clone, Default)]
struct CanonicalGraph {
    nodes: Vec<CanonicalNode>,
    hash: String,
}

fn canonical_from_yaml(document: &Value) -> Option<CanonicalGraph> {
    let raw_nodes = document.get("nodes")?.as_array()?;
    if raw_nodes.is_empty() {
        return None;
    }

    let mut nodes: Vec<CanonicalNode> = Vec::new();
    for raw in raw_nodes {
        let Some(id) = raw.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let ref_id = raw
            .get("tool")
            .or_else(|| raw.get("refId"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let config = raw
            .get("inputs")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();

        nodes.push(CanonicalNode {
            id: id.to_string(),
            ref_id,
            parent_id: string_field(raw, "stage").filter(|value| !value.is_empty()),
            config,
            is_batch: raw
                .get("isBatch")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            max_concurrency: int_field(raw, "maxConcurrency"),
            iterable_pin: string_field(raw, "iterablePin").filter(|value| !value.is_empty()),
            skip_on_error: raw.get("skipOnError").and_then(|v| v.as_bool()),
            source_path: raw
                .get("metadata")
                .and_then(|m| m.get("sourcePath"))
                .and_then(|v| v.as_str())
                .map(str::to_string),
        });
    }

    if nodes.is_empty() {
        return None;
    }

    let mut edges: Vec<CanonicalEdge> = Vec::new();
    if let Some(raw_edges) = document.get("edges").and_then(|v| v.as_array()) {
        for raw in raw_edges {
            let from = raw.get("from").and_then(|v| v.as_str());
            let to = raw.get("to").and_then(|v| v.as_str());
            if let (Some(from), Some(to)) = (from, to) {
                let Some(from) = normalize_dsl_edge(from, "out") else {
                    continue;
                };
                let Some(to) = normalize_dsl_edge(to, "in") else {
                    continue;
                };
                edges.push(CanonicalEdge { from, to });
            }
        }
    }

    Some(finalize_graph(nodes, edges))
}

fn canonical_from_snapshot(document: &Value) -> Option<CanonicalGraph> {
    let raw_nodes = document.get("nodes")?.as_array()?;
    if raw_nodes.is_empty() {
        return None;
    }

    let mut nodes: Vec<CanonicalNode> = Vec::new();
    for raw in raw_nodes {
        let Some(id) = raw.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let ref_id = raw
            .get("refId")
            .or_else(|| raw.get("tool"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut config = raw
            .get("configValues")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();

        let is_batch = config
            .get("_isBatch")
            .and_then(|v| v.as_bool())
            .or_else(|| raw.get("isBatch").and_then(|v| v.as_bool()))
            .unwrap_or(false);
        let max_concurrency = config
            .get("_maxConcurrency")
            .and_then(|v| v.as_i64())
            .or_else(|| raw.get("maxConcurrency").and_then(|v| v.as_i64()));
        let iterable_pin = config
            .get("_iterablePin")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| string_field(raw, "iterablePin").filter(|value| !value.is_empty()));
        let skip_on_error = config
            .get("_skipOnError")
            .and_then(|v| v.as_bool())
            .or_else(|| raw.get("skipOnError").and_then(|v| v.as_bool()));

        for key in BATCH_FLAG_KEYS {
            config.remove(*key);
        }

        nodes.push(CanonicalNode {
            id: id.to_string(),
            ref_id,
            parent_id: string_field(raw, "parentId")
                .or_else(|| string_field(raw, "stage"))
                .filter(|value| !value.is_empty()),
            config,
            is_batch,
            max_concurrency,
            iterable_pin,
            skip_on_error,
            source_path: raw
                .get("metadata")
                .and_then(|m| m.get("sourcePath"))
                .and_then(|v| v.as_str())
                .map(str::to_string),
        });
    }

    if nodes.is_empty() {
        return None;
    }

    let mut edges: Vec<CanonicalEdge> = Vec::new();
    if let Some(raw_edges) = document.get("edges").and_then(|v| v.as_array()) {
        for raw in raw_edges {
            let Some(source_id) = raw.get("sourceNodeId").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(target_id) = raw.get("targetNodeId").and_then(|v| v.as_str()) else {
                continue;
            };
            let source_pin = raw
                .get("sourcePin")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("out");
            let target_pin = raw
                .get("targetPin")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("in");
            edges.push(CanonicalEdge {
                from: format!("{}.{}", source_id, source_pin),
                to: format!("{}.{}", target_id, target_pin),
            });
        }
    }

    Some(finalize_graph(nodes, edges))
}

fn finalize_graph(mut nodes: Vec<CanonicalNode>, mut edges: Vec<CanonicalEdge>) -> CanonicalGraph {
    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    edges.sort_by(|a, b| a.from.cmp(&b.from).then_with(|| a.to.cmp(&b.to)));

    let node_values: Vec<Value> = nodes.iter().map(canonical_node_json).collect();
    let edge_values: Vec<Value> = edges
        .iter()
        .map(|edge| serde_json::json!({ "from": edge.from, "to": edge.to }))
        .collect();

    let document = serde_json::json!({ "nodes": node_values, "edges": edge_values });
    let serialized = serde_json::to_string(&document).unwrap_or_else(|_| "{}".to_string());

    CanonicalGraph {
        nodes,
        hash: sha256_hex_bytes(serialized.as_bytes()),
    }
}

fn canonical_node_json(node: &CanonicalNode) -> Value {
    let mut map = Map::new();
    map.insert("id".to_string(), Value::String(node.id.clone()));
    map.insert("refId".to_string(), Value::String(node.ref_id.clone()));
    if let Some(parent_id) = &node.parent_id {
        map.insert("parentId".to_string(), Value::String(parent_id.clone()));
    }
    map.insert("config".to_string(), Value::Object(node.config.clone()));

    if node.is_batch {
        map.insert("isBatch".to_string(), Value::Bool(true));
        if let Some(value) = node.max_concurrency {
            map.insert("maxConcurrency".to_string(), Value::from(value));
        }
        if let Some(value) = &node.iterable_pin {
            map.insert("iterablePin".to_string(), Value::String(value.clone()));
        }
        if let Some(value) = node.skip_on_error {
            map.insert("skipOnError".to_string(), Value::Bool(value));
        }
    }

    Value::Object(map)
}

fn normalize_dsl_edge(raw: &str, default_pin: &str) -> Option<String> {
    let text = raw.trim();
    if text.is_empty() {
        return None;
    }
    match text.split_once('.') {
        Some((node_id, pin)) if !node_id.is_empty() && !pin.is_empty() => {
            Some(format!("{}.{}", node_id, pin))
        }
        Some((node_id, _)) if !node_id.is_empty() => {
            Some(format!("{}.{}", node_id, default_pin))
        }
        _ => Some(format!("{}.{}", text, default_pin)),
    }
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

struct ComponentEntry {
    full_path: PathBuf,
    relative_path: String,
}

struct PipelineScanState {
    slug: String,
    kind: String,
    relative_path: String,
    graph_source: String,
    graph_hash: String,
    depends_on: BTreeSet<String>,
    script_keys: BTreeSet<String>,
    constant_keys: BTreeSet<String>,
    asset_keys: BTreeSet<String>,
}

struct ManifestScanner {
    root: PathBuf,
    root_display: String,
    root_is_dir: bool,
    palette: HashMap<String, Value>,
    components: BTreeMap<String, ComponentEntry>,
    constants: BTreeMap<String, Value>,
    scripts_dir: Option<String>,
    diagnostics: Vec<ManifestDiagnostic>,
    script_used_by: BTreeMap<String, BTreeSet<String>>,
    constant_used_by: BTreeMap<String, BTreeSet<String>>,
    assets: BTreeMap<String, ManifestAsset>,
    asset_hashes: HashMap<String, (u64, String)>,
    referenced_script_paths: HashSet<String>,
}

impl ManifestScanner {
    fn new(root_path: &Path) -> Self {
        let absolute = if root_path.is_absolute() {
            root_path.to_path_buf()
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(root_path)
        };
        let root = std::fs::canonicalize(&absolute)
            .map(|path| strip_verbatim(&path))
            .unwrap_or_else(|_| strip_verbatim(&absolute));

        Self {
            root,
            root_display: root_path.to_string_lossy().to_string(),
            root_is_dir: root_path.is_dir(),
            palette: HashMap::new(),
            components: BTreeMap::new(),
            constants: BTreeMap::new(),
            scripts_dir: Some(DEFAULT_SCRIPTS_DIR.to_string()),
            diagnostics: Vec::new(),
            script_used_by: BTreeMap::new(),
            constant_used_by: BTreeMap::new(),
            assets: BTreeMap::new(),
            asset_hashes: HashMap::new(),
            referenced_script_paths: HashSet::new(),
        }
    }

    fn run(
        &mut self,
        root_pipeline_paths: &[String],
        persist: bool,
    ) -> TemplateDependencyManifest {
        let mut manifest = TemplateDependencyManifest {
            root_path: self.root_display.clone(),
            generated_at: now_iso8601(),
            ..Default::default()
        };

        if !self.root_is_dir {
            self.diag(
                LEVEL_ERROR,
                "INVALID_PIPELINE_YAML",
                format!("Workspace root path is not a directory: {}", self.root_display),
                None,
                None,
            );
            manifest.diagnostics = self.take_diagnostics();
            return manifest;
        }

        let workspace_initialized = self.root.join(".forgity").is_dir();
        let db = if workspace_initialized {
            WorkspaceDb::open(&self.root).ok()
        } else {
            None
        };

        self.load_workspace_config();
        self.load_palette(db.as_ref());
        self.load_components(db.as_ref());
        self.load_constants(db.as_ref());

        let states = self.scan_pipelines(root_pipeline_paths, db.as_ref());
        self.detect_cycles(&states);

        let scripts = self.build_scripts();
        let constants = self.build_constants();

        let mut pipelines: Vec<ManifestPipeline> = states
            .iter()
            .map(|state| ManifestPipeline {
                slug: state.slug.clone(),
                kind: state.kind.clone(),
                relative_path: state.relative_path.clone(),
                graph_source: state.graph_source.clone(),
                graph_hash: state.graph_hash.clone(),
                depends_on: state.depends_on.iter().cloned().collect(),
                script_keys: state.script_keys.iter().cloned().collect(),
            })
            .collect();
        pipelines.sort_by(|a, b| {
            kind_rank(&a.kind)
                .cmp(&kind_rank(&b.kind))
                .then_with(|| a.slug.cmp(&b.slug))
        });

        manifest.pipelines = pipelines;
        manifest.scripts = scripts;
        manifest.constants = constants;
        manifest.assets = self.assets.values().cloned().collect();

        if persist {
            if workspace_initialized {
                manifest.persisted = self.persist_dependencies(db.as_ref(), &states);
            } else {
                self.diag(
                    LEVEL_INFO,
                    "WORKSPACE_NOT_INITIALIZED",
                    "Workspace has no .forgity directory; dependencies were not persisted.".to_string(),
                    None,
                    None,
                );
            }
        }

        manifest.diagnostics = self.take_diagnostics();
        manifest.totals = build_totals(&manifest);
        manifest
    }

    // -- context loading ----------------------------------------------------

    fn load_workspace_config(&mut self) {
        let path = self.root.join(".forgity").join("workspace.json");
        let Ok(content) = std::fs::read_to_string(&path) else {
            return;
        };
        let Ok(value) = serde_json::from_str::<Value>(&content) else {
            return;
        };
        if let Some(dir) = value.get("scriptsDir").and_then(|v| v.as_str()) {
            let trimmed = dir.trim();
            self.scripts_dir = if trimmed.is_empty() || trimmed == "." {
                None
            } else {
                Some(trimmed.to_string())
            };
        }
    }

    fn load_palette(&mut self, db: Option<&WorkspaceDb>) {
        let Some(db) = db else {
            self.diag(
                LEVEL_WARNING,
                "PALETTE_EMPTY",
                "workspace.db is unavailable; script/palette lookups are disabled.".to_string(),
                None,
                None,
            );
            return;
        };

        let palette_json = match db.load_palette_json() {
            Ok(json) => json,
            Err(err) => {
                self.diag(
                    LEVEL_WARNING,
                    "PALETTE_EMPTY",
                    format!("Failed to read palette from workspace.db: {}", err),
                    None,
                    None,
                );
                return;
            }
        };

        let parsed: HashMap<String, Value> = serde_json::from_str(&palette_json).unwrap_or_default();
        if parsed.is_empty() {
            self.diag(
                LEVEL_WARNING,
                "PALETTE_EMPTY",
                "workspace.db has no analyzed script yet; run a script scan first.".to_string(),
                None,
                None,
            );
        }
        self.palette = parsed;
    }

    fn load_components(&mut self, db: Option<&WorkspaceDb>) {
        for (slug, full_path, relative_path) in discover_component_pipelines(&self.root, db) {
            self.components.insert(
                slug,
                ComponentEntry {
                    full_path: PathBuf::from(full_path),
                    relative_path,
                },
            );
        }
    }

    fn load_constants(&mut self, db: Option<&WorkspaceDb>) {
        let contracts = load_contracts_file(&self.root);

        for constant in contracts.constants {
            let Some(key) = constant
                .get("key")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            else {
                continue;
            };
            self.constants.insert(key.to_string(), constant);
        }

        let Some(db) = db else {
            return;
        };
        let Ok(constants_json) = db.load_constants_json() else {
            return;
        };
        let Ok(runtime_constants) = serde_json::from_str::<Vec<Value>>(&constants_json) else {
            return;
        };

        for constant in runtime_constants {
            let Some(key) = constant
                .get("key")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            else {
                continue;
            };
            match self.constants.get_mut(key) {
                Some(existing) => {
                    let has_value = existing.get("value").map(|v| !v.is_null()).unwrap_or(false);
                    if !has_value {
                        *existing = constant;
                    }
                }
                None => {
                    self.constants.insert(key.to_string(), constant);
                }
            }
        }
    }

    // -- pipeline graph -----------------------------------------------------

    fn scan_pipelines(
        &mut self,
        root_pipeline_paths: &[String],
        db: Option<&WorkspaceDb>,
    ) -> Vec<PipelineScanState> {
        let mut queue: VecDeque<(String, String, PathBuf)> = VecDeque::new();

        for raw in root_pipeline_paths {
            let path = self.resolve_input_path(raw);
            let slug = pipeline_slug_from_path(&path);
            if slug.is_empty() {
                self.diag(
                    LEVEL_ERROR,
                    "INVALID_PIPELINE_YAML",
                    format!("Cannot derive a pipeline slug from '{}'.", raw),
                    None,
                    None,
                );
                continue;
            }
            let kind = pipeline_kind_from_path(&path);
            queue.push_back((slug, kind, path));
        }

        let mut states: Vec<PipelineScanState> = Vec::new();
        let mut scanned: HashMap<String, PathBuf> = HashMap::new();

        while let Some((slug, kind, path)) = queue.pop_front() {
            if let Some(previous) = scanned.get(&slug) {
                if normalize_path_key(previous) != normalize_path_key(&path) {
                    self.diag(
                        LEVEL_ERROR,
                        "DUPLICATE_PIPELINE_SLUG",
                        format!(
                            "Slug '{}' is declared by both '{}' and '{}'.",
                            slug,
                            previous.to_string_lossy(),
                            path.to_string_lossy()
                        ),
                        Some(slug.clone()),
                        None,
                    );
                }
                continue;
            }
            scanned.insert(slug.clone(), path.clone());

            let snapshot_json = db.and_then(|db| match db.load_pipeline_snapshot(&slug) {
                Ok(value) => value,
                Err(_) => None,
            });
            let snapshot_document = snapshot_json
                .as_deref()
                .and_then(|text| serde_json::from_str::<Value>(text).ok());
            let snapshot_graph = snapshot_document
                .as_ref()
                .and_then(canonical_from_snapshot);

            let yaml_bytes = std::fs::read(&path).ok();
            let yaml_document = yaml_bytes
                .as_deref()
                .and_then(|bytes| serde_yaml::from_slice::<Value>(bytes).ok());
            let yaml_graph = yaml_document.as_ref().and_then(canonical_from_yaml);

            if snapshot_json.is_some() && snapshot_graph.is_none() {
                self.diag(
                    LEVEL_WARNING,
                    "SNAPSHOT_PARSE_FAILED",
                    format!(
                        "Snapshot of '{}' is corrupted or empty; falling back to YAML.",
                        slug
                    ),
                    Some(slug.clone()),
                    None,
                );
            }
            if snapshot_json.is_none() {
                self.diag(
                    LEVEL_INFO,
                    "SNAPSHOT_MISSING",
                    format!("Pipeline '{}' has no snapshot yet; using YAML.", slug),
                    Some(slug.clone()),
                    None,
                );
            }
            if snapshot_graph.is_some() && yaml_graph.is_none() {
                self.diag(
                    LEVEL_WARNING,
                    "YAML_PARSE_FAILED",
                    format!(
                        "YAML of '{}' is missing or invalid; snapshot is used as-is.",
                        slug
                    ),
                    Some(slug.clone()),
                    None,
                );
            }

            let (graph, graph_source) = match (snapshot_graph, yaml_graph) {
                (Some(snapshot), Some(yaml)) => {
                    if snapshot.hash != yaml.hash {
                        self.diag(
                            LEVEL_WARNING,
                            "GRAPH_DIVERGED",
                            format!(
                                "Snapshot and YAML of '{}' diverge (canvas not saved); snapshot wins.",
                                slug
                            ),
                            Some(slug.clone()),
                            None,
                        );
                    }
                    (snapshot, GRAPH_SOURCE_SNAPSHOT)
                }
                (Some(snapshot), None) => (snapshot, GRAPH_SOURCE_SNAPSHOT),
                (None, Some(yaml)) => (yaml, GRAPH_SOURCE_YAML),
                (None, None) => {
                    self.diag(
                        LEVEL_ERROR,
                        "INVALID_PIPELINE_YAML",
                        format!(
                            "'{}' has neither a usable snapshot nor a valid YAML graph.",
                            path.to_string_lossy()
                        ),
                        Some(slug.clone()),
                        None,
                    );
                    continue;
                }
            };

            let yaml_source_paths = source_paths_by_node(yaml_document.as_ref());

            let mut state = PipelineScanState {
                slug: slug.clone(),
                kind: kind.clone(),
                relative_path: relative_to_root(&self.root, &path)
                    .unwrap_or_else(|| path.to_string_lossy().replace('\\', "/")),
                graph_source: graph_source.to_string(),
                graph_hash: graph.hash.clone(),
                depends_on: BTreeSet::new(),
                script_keys: BTreeSet::new(),
                constant_keys: BTreeSet::new(),
                asset_keys: BTreeSet::new(),
            };

            for node in &graph.nodes {
                self.scan_node(&mut state, node, &yaml_source_paths, &mut queue);
            }

            states.push(state);
        }

        states.sort_by(|a, b| {
            kind_rank(&a.kind)
                .cmp(&kind_rank(&b.kind))
                .then_with(|| a.slug.cmp(&b.slug))
        });
        states
    }

    fn scan_node(
        &mut self,
        state: &mut PipelineScanState,
        node: &CanonicalNode,
        yaml_source_paths: &HashMap<String, String>,
        queue: &mut VecDeque<(String, String, PathBuf)>,
    ) {
        let node_id = if node.id.is_empty() {
            None
        } else {
            Some(node.id.clone())
        };

        if node.ref_id.trim().is_empty() {
            self.diag(
                LEVEL_WARNING,
                "INVALID_NODE_TOOL",
                "Node has no string 'tool'/'refId' reference and was skipped.".to_string(),
                Some(state.slug.clone()),
                node_id.clone(),
            );
        } else {
            self.classify_reference(state, &node.ref_id, node_id.as_deref(), queue);
        }

        self.scan_node_constant_refs(state, node, node_id.as_deref());
        self.scan_node_assets(state, node, yaml_source_paths, node_id.as_deref());
    }

    fn classify_reference(
        &mut self,
        state: &mut PipelineScanState,
        reference: &str,
        node_id: Option<&str>,
        queue: &mut VecDeque<(String, String, PathBuf)>,
    ) {
        let reference = reference.trim();

        if let Some(slug) = reference.strip_prefix(REF_COMPONENT_PREFIX) {
            let slug = slug.trim();
            if slug.is_empty() {
                self.diag(
                    LEVEL_ERROR,
                    "MISSING_COMPONENT",
                    format!("Empty component reference '{}'.", reference),
                    Some(state.slug.clone()),
                    node_id.map(str::to_string),
                );
                return;
            }
            state.depends_on.insert(slug.to_string());
            match self.components.get(slug) {
                Some(entry) => {
                    let component_path = if entry.full_path.is_file() {
                        entry.full_path.clone()
                    } else {
                        self.root.join(&entry.relative_path)
                    };
                    queue.push_back((
                        slug.to_string(),
                        KIND_COMPONENT.to_string(),
                        component_path,
                    ));
                }
                None => {
                    self.diag(
                        LEVEL_ERROR,
                        "MISSING_COMPONENT",
                        format!("Component '{}' has no matching '*.component.yaml'.", slug),
                        Some(state.slug.clone()),
                        node_id.map(str::to_string),
                    );
                }
            }
            return;
        }

        if let Some(key) = reference.strip_prefix(REF_CONSTANT_PREFIX) {
            let key = key.trim();
            state.constant_keys.insert(key.to_string());
            self.constant_used_by
                .entry(key.to_string())
                .or_default()
                .insert(state.slug.clone());
            if !self.constants.contains_key(key) {
                self.diag(
                    LEVEL_WARNING,
                    "UNDEFINED_CONSTANT",
                    format!(
                        "Constant '{}' is referenced but not declared in contracts.yaml.",
                        key
                    ),
                    Some(state.slug.clone()),
                    node_id.map(str::to_string),
                );
            }
            return;
        }

        if let Some(key) = reference.strip_prefix(REF_SCRIPT_PREFIX) {
            let key = key.trim().to_string();
            state.script_keys.insert(key.clone());
            self.script_used_by
                .entry(key.clone())
                .or_default()
                .insert(state.slug.clone());

            match self.palette.get(&key) {
                Some(item) => {
                    let full_path = item
                        .get("fullPath")
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(PathBuf::from)
                        .or_else(|| {
                            item.get("relativePath")
                                .and_then(|v| v.as_str())
                                .map(|relative| match &self.scripts_dir {
                                    Some(dir) => self.root.join(dir).join(relative),
                                    None => self.root.join(relative),
                                })
                        });
                    if let Some(path) = full_path {
                        self.referenced_script_paths
                            .insert(normalize_path_key(&path));
                    }
                }
                None => {
                    self.diag(
                        LEVEL_ERROR,
                        "DANGLING_SCRIPT",
                        format!("Script '{}' is not present in the local palette.", key),
                        Some(state.slug.clone()),
                        node_id.map(str::to_string),
                    );
                }
            }
        }
    }

    // -- constants on node config -------------------------------------------

    fn scan_node_constant_refs(
        &mut self,
        state: &mut PipelineScanState,
        node: &CanonicalNode,
        node_id: Option<&str>,
    ) {
        if node.config.is_empty() {
            return;
        }

        let mut leaves: Vec<(String, String)> = Vec::new();
        collect_string_leaves(
            &Value::Object(node.config.clone()),
            "",
            &mut leaves,
        );

        for (_, raw) in leaves {
            for token in extract_template_tokens(&raw) {
                if token.is_empty() {
                    continue;
                }
                state.constant_keys.insert(token.clone());
                self.constant_used_by
                    .entry(token.clone())
                    .or_default()
                    .insert(state.slug.clone());
                if !self.constants.contains_key(&token) {
                    self.diag(
                        LEVEL_WARNING,
                        "DANGLING_CONSTANT_REF",
                        format!("Node config references undefined constant '${{{}}}'.", token),
                        Some(state.slug.clone()),
                        node_id.map(str::to_string),
                    );
                }
            }
        }
    }

    // -- assets -------------------------------------------------------------

    fn scan_node_assets(
        &mut self,
        state: &mut PipelineScanState,
        node: &CanonicalNode,
        yaml_source_paths: &HashMap<String, String>,
        node_id: Option<&str>,
    ) {
        let mut leaves: Vec<(String, String)> = Vec::new();
        if !node.config.is_empty() {
            collect_string_leaves(&Value::Object(node.config.clone()), "", &mut leaves);
        }

        let source_path = node
            .source_path
            .clone()
            .or_else(|| yaml_source_paths.get(&node.id).cloned());
        if let Some(source_path) = source_path {
            leaves.push(("metadata.sourcePath".to_string(), source_path));
        }

        for (key, raw) in leaves {
            self.process_asset_candidate(state, &raw, node_id, &key);
        }
    }

    fn process_asset_candidate(
        &mut self,
        state: &mut PipelineScanState,
        raw: &str,
        node_id: Option<&str>,
        input_key: &str,
    ) {
        let trimmed = raw.trim();
        if !looks_like_path(trimmed) {
            return;
        }

        if trimmed.contains("${") {
            self.diag(
                LEVEL_INFO,
                "DEFERRED_PATH",
                format!(
                    "Path '{}' contains runtime placeholders and was deferred.",
                    trimmed
                ),
                Some(state.slug.clone()),
                node_id.map(str::to_string),
            );
            return;
        }

        if let Some(extension) = file_extension(trimmed) {
            if CONFIG_EXTENSIONS.contains(&extension.as_str()) {
                return;
            }
        }

        let raw_path = PathBuf::from(trimmed);
        let absolute = if raw_path.is_absolute() {
            raw_path
        } else {
            self.root.join(raw_path)
        };

        let resolved = match std::fs::canonicalize(&absolute) {
            Ok(path) => strip_verbatim(&path),
            Err(_) => {
                let lexical = normalize_lexically(&absolute);
                if !path_within_root(&self.root, &lexical) {
                    self.diag(
                        LEVEL_ERROR,
                        "PATH_ESCAPE",
                        format!("Asset path '{}' escapes the workspace root.", trimmed),
                        Some(state.slug.clone()),
                        node_id.map(str::to_string),
                    );
                    return;
                }
                self.diag(
                    LEVEL_WARNING,
                    "MISSING_ASSET",
                    format!("Asset '{}' does not exist on disk.", trimmed),
                    Some(state.slug.clone()),
                    node_id.map(str::to_string),
                );
                return;
            }
        };

        if !path_within_root(&self.root, &resolved) {
            self.diag(
                LEVEL_ERROR,
                "PATH_ESCAPE",
                format!("Asset path '{}' escapes the workspace root.", trimmed),
                Some(state.slug.clone()),
                node_id.map(str::to_string),
            );
            return;
        }

        if !resolved.is_file() {
            return;
        }

        let path_key = normalize_path_key(&resolved);
        if self.referenced_script_paths.contains(&path_key) {
            return;
        }

        let Some(relative_path) = relative_to_root(&self.root, &resolved) else {
            self.diag(
                LEVEL_ERROR,
                "PATH_ESCAPE",
                format!(
                    "Asset path '{}' cannot be relativized against the workspace root.",
                    trimmed
                ),
                Some(state.slug.clone()),
                node_id.map(str::to_string),
            );
            return;
        };

        let dedupe_key = relative_path.to_ascii_lowercase();
        state.asset_keys.insert(relative_path.clone());

        if self.assets.contains_key(&dedupe_key) {
            return;
        }

        let (size_bytes, hash) = self.hash_asset(&resolved, &dedupe_key);
        let name = resolved
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| relative_path.clone());

        self.assets.insert(
            dedupe_key,
            ManifestAsset {
                name,
                relative_path,
                size_bytes,
                hash,
                node_id: node_id.map(str::to_string),
                input_key: Some(input_key.to_string()),
            },
        );
    }

    fn hash_asset(&mut self, path: &Path, dedupe_key: &str) -> (u64, String) {
        if let Some(cached) = self.asset_hashes.get(dedupe_key) {
            return cached.clone();
        }

        let result = hash_file(path, DEFAULT_MAX_HASH_BYTES);
        self.asset_hashes
            .insert(dedupe_key.to_string(), result.clone());
        result
    }

    // -- cycle detection ----------------------------------------------------

    fn detect_cycles(&mut self, states: &[PipelineScanState]) {
        let adjacency: BTreeMap<String, Vec<String>> = states
            .iter()
            .map(|state| {
                (
                    state.slug.clone(),
                    state.depends_on.iter().cloned().collect::<Vec<String>>(),
                )
            })
            .collect();

        let mut colors: HashMap<String, u8> = HashMap::new();
        let mut path: Vec<String> = Vec::new();
        let roots: Vec<String> = states.iter().map(|state| state.slug.clone()).collect();

        for root in roots {
            if colors.get(&root).copied().unwrap_or(0) == 0 {
                self.dfs_cycle(&root, &adjacency, &mut colors, &mut path);
            }
        }
    }

    fn dfs_cycle(
        &mut self,
        node: &str,
        adjacency: &BTreeMap<String, Vec<String>>,
        colors: &mut HashMap<String, u8>,
        path: &mut Vec<String>,
    ) {
        colors.insert(node.to_string(), 1);
        path.push(node.to_string());

        if let Some(neighbors) = adjacency.get(node) {
            for next in neighbors {
                match colors.get(next).copied().unwrap_or(0) {
                    0 => self.dfs_cycle(next, adjacency, colors, path),
                    1 => {
                        let start = path.iter().position(|item| item == next).unwrap_or(0);
                        let mut cycle: Vec<String> = path[start..].to_vec();
                        cycle.push(next.clone());
                        self.diag(
                            LEVEL_WARNING,
                            "CYCLIC_COMPONENT",
                            format!("Component cycle detected: {}", cycle.join(" -> ")),
                            Some(next.clone()),
                            None,
                        );
                    }
                    _ => {}
                }
            }
        }

        path.pop();
        colors.insert(node.to_string(), 2);
    }

    // -- manifest sections --------------------------------------------------

    fn build_scripts(&mut self) -> Vec<ManifestScript> {
        let mut scripts: Vec<ManifestScript> = Vec::new();

        for (key, used_by) in self.script_used_by.clone() {
            let Some(item) = self.palette.get(&key).cloned() else {
                continue;
            };

            let executor = string_field(&item, "executor").unwrap_or_else(|| "python".to_string());
            let content_hash = string_field(&item, "contentHash").unwrap_or_default();
            let source_code = string_field(&item, "sourceCode").unwrap_or_default();
            if source_code.trim().is_empty() {
                self.diag(
                    LEVEL_WARNING,
                    "EMPTY_SOURCE_CODE",
                    format!(
                        "Palette item '{}' has no source code; cloud publish would send an empty script.",
                        key
                    ),
                    used_by.iter().next().cloned(),
                    None,
                );
            }

            let mut requirements: BTreeSet<String> = BTreeSet::new();
            if let Some(dependencies) = item.get("dependencies").and_then(|v| v.as_array()) {
                for dependency in dependencies {
                    let module = string_field(dependency, "module").unwrap_or_default();
                    let package = string_field(dependency, "packageName").unwrap_or_default();
                    let requirement = if !package.trim().is_empty() {
                        package.trim().to_string()
                    } else {
                        module.trim().to_string()
                    };
                    if !requirement.is_empty() {
                        requirements.insert(requirement);
                    }
                }
            }

            scripts.push(ManifestScript {
                key,
                executor,
                content_hash,
                source_code,
                requirements: requirements.into_iter().collect(),
                used_by: used_by.into_iter().collect(),
            });
        }

        scripts.sort_by(|a, b| a.key.cmp(&b.key));
        scripts
    }

    fn build_constants(&mut self) -> Vec<ManifestConstant> {
        let declared: Vec<(String, Value)> = self.constants.clone().into_iter().collect();
        let mut constants: Vec<ManifestConstant> = Vec::new();

        for (key, value) in declared {
            let value_refs = collect_reference_tokens(&value);
            for reference in &value_refs {
                if !self.constants.contains_key(reference) {
                    self.diag(
                        LEVEL_WARNING,
                        "DANGLING_CONSTANT_REF",
                        format!(
                            "Constant '{}' references undefined constant '${{{}}}'.",
                            key, reference
                        ),
                        None,
                        None,
                    );
                }
            }

            constants.push(ManifestConstant {
                data_type: string_field(&value, "dataType").unwrap_or_else(|| "String".to_string()),
                scope: string_field(&value, "scope").unwrap_or_else(|| "General".to_string()),
                value_json: serde_json::to_string(value.get("value").unwrap_or(&Value::Null))
                    .unwrap_or_else(|_| "null".to_string()),
                used_by: self
                    .constant_used_by
                    .get(&key)
                    .map(|set| set.iter().cloned().collect())
                    .unwrap_or_default(),
                key,
            });
        }

        constants.sort_by(|a, b| a.key.cmp(&b.key));
        constants
    }

    // -- persistence --------------------------------------------------------

    fn persist_dependencies(
        &mut self,
        db: Option<&WorkspaceDb>,
        states: &[PipelineScanState],
    ) -> bool {
        let Some(db) = db else {
            self.diag(
                LEVEL_ERROR,
                "PERSIST_FAILED",
                "workspace.db could not be opened; dependencies were not persisted.".to_string(),
                None,
                None,
            );
            return false;
        };

        let parents: Vec<(String, String)> = states
            .iter()
            .map(|state| (PARENT_KIND_PIPELINE.to_string(), state.slug.clone()))
            .collect();

        let mut rows: Vec<LocalDependencyRow> = Vec::new();
        for state in states {
            let parent_key = state.slug.clone();
            let mut push = |dep_kind: &str, dep_key: &str| {
                rows.push(LocalDependencyRow {
                    parent_kind: PARENT_KIND_PIPELINE.to_string(),
                    parent_key: parent_key.clone(),
                    dep_kind: dep_kind.to_string(),
                    dep_key: dep_key.to_string(),
                });
            };
            for slug in &state.depends_on {
                push("component", slug);
            }
            for key in &state.script_keys {
                push("script", key);
            }
            for key in &state.constant_keys {
                push("constant", key);
            }
            for path in &state.asset_keys {
                push("asset", path);
            }
        }

        match db.replace_dependencies(&parents, &rows) {
            Ok(()) => true,
            Err(err) => {
                self.diag(
                    LEVEL_ERROR,
                    "PERSIST_FAILED",
                    format!("Failed to persist local_dependencies: {}", err),
                    None,
                    None,
                );
                false
            }
        }
    }

    // -- helpers ------------------------------------------------------------

    fn resolve_input_path(&self, raw: &str) -> PathBuf {
        let path = PathBuf::from(raw);
        if path.is_absolute() {
            path
        } else {
            self.root.join(path)
        }
    }

    fn diag(
        &mut self,
        level: &str,
        code: &str,
        message: String,
        pipeline_slug: Option<String>,
        node_id: Option<String>,
    ) {
        self.diagnostics.push(ManifestDiagnostic {
            level: level.to_string(),
            code: code.to_string(),
            message,
            pipeline_slug,
            node_id,
        });
    }

    fn take_diagnostics(&mut self) -> Vec<ManifestDiagnostic> {
        let mut list = std::mem::take(&mut self.diagnostics);
        list.sort_by(|a, b| {
            level_rank(&a.level)
                .cmp(&level_rank(&b.level))
                .then_with(|| a.code.cmp(&b.code))
                .then_with(|| a.pipeline_slug.cmp(&b.pipeline_slug))
                .then_with(|| a.node_id.cmp(&b.node_id))
                .then_with(|| a.message.cmp(&b.message))
        });
        list.dedup_by(|a, b| {
            a.level == b.level
                && a.code == b.code
                && a.pipeline_slug == b.pipeline_slug
                && a.node_id == b.node_id
                && a.message == b.message
        });
        list
    }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

fn build_totals(manifest: &TemplateDependencyManifest) -> ManifestTotals {
    let master_count = manifest
        .pipelines
        .iter()
        .filter(|pipeline| pipeline.kind.eq_ignore_ascii_case(KIND_MASTER))
        .count() as u32;
    let component_count = manifest
        .pipelines
        .iter()
        .filter(|pipeline| pipeline.kind.eq_ignore_ascii_case(KIND_COMPONENT))
        .count() as u32;

    ManifestTotals {
        master_count,
        component_count,
        script_count: manifest.scripts.len() as u32,
        constant_count: manifest.constants.len() as u32,
        asset_count: manifest.assets.len() as u32,
        asset_bytes: manifest.assets.iter().map(|asset| asset.size_bytes).sum(),
        error_count: manifest
            .diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.level == LEVEL_ERROR)
            .count() as u32,
        warning_count: manifest
            .diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.level == LEVEL_WARNING)
            .count() as u32,
    }
}

fn kind_rank(kind: &str) -> u8 {
    if kind.eq_ignore_ascii_case(KIND_COMPONENT) {
        1
    } else {
        0
    }
}

fn level_rank(level: &str) -> u8 {
    match level {
        LEVEL_ERROR => 0,
        LEVEL_WARNING => 1,
        _ => 2,
    }
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn int_field(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|v| v.as_i64())
}

fn source_paths_by_node(document: Option<&Value>) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Some(nodes) = document
        .and_then(|doc| doc.get("nodes"))
        .and_then(|v| v.as_array())
    else {
        return map;
    };

    for node in nodes {
        let Some(id) = node.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        if let Some(source_path) = node
            .get("metadata")
            .and_then(|m| m.get("sourcePath"))
            .and_then(|v| v.as_str())
        {
            map.insert(id.to_string(), source_path.to_string());
        }
    }

    map
}

fn pipeline_slug_from_path(path: &Path) -> String {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    for suffix in [
        ".component.yaml",
        ".component.yml",
        ".pipeline.yaml",
        ".pipeline.yml",
        ".yaml",
        ".yml",
    ] {
        if let Some(stem) = file_name.strip_suffix(suffix) {
            return stem.to_string();
        }
    }
    file_name
}

fn pipeline_kind_from_path(path: &Path) -> String {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if file_name.ends_with(".component.yaml") || file_name.ends_with(".component.yml") {
        KIND_COMPONENT.to_string()
    } else {
        KIND_MASTER.to_string()
    }
}

fn collect_string_leaves(value: &Value, prefix: &str, out: &mut Vec<(String, String)>) {
    match value {
        Value::String(text) => out.push((prefix.to_string(), text.clone())),
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                let child = if prefix.is_empty() {
                    format!("[{}]", index)
                } else {
                    format!("{}[{}]", prefix, index)
                };
                collect_string_leaves(item, &child, out);
            }
        }
        Value::Object(map) => {
            for (key, item) in map {
                let child = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", prefix, key)
                };
                collect_string_leaves(item, &child, out);
            }
        }
        _ => {}
    }
}

fn collect_reference_tokens(value: &Value) -> Vec<String> {
    let mut tokens: BTreeSet<String> = BTreeSet::new();
    collect_tokens_from_value(value, &mut tokens);
    tokens.into_iter().collect()
}

fn collect_tokens_from_value(value: &Value, tokens: &mut BTreeSet<String>) {
    match value {
        Value::String(text) => {
            for token in extract_template_tokens(text) {
                tokens.insert(token);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_tokens_from_value(item, tokens);
            }
        }
        Value::Object(map) => {
            for item in map.values() {
                collect_tokens_from_value(item, tokens);
            }
        }
        _ => {}
    }
}

fn extract_template_tokens(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut index = 0usize;

    while index < text.len() {
        let Some(offset) = text[index..].find("${") else {
            break;
        };
        let start = index + offset + 2;
        let Some(end_offset) = text[start..].find('}') else {
            break;
        };
        let candidate = text[start..start + end_offset].trim();
        if !candidate.is_empty()
            && candidate
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            tokens.push(candidate.to_string());
        }
        index = start + end_offset + 1;
    }

    tokens
}

fn looks_like_path(raw: &str) -> bool {
    if raw.len() < 3 || raw.len() > 4096 {
        return false;
    }
    if raw.starts_with("local:") || raw.contains("://") {
        return false;
    }
    if raw.contains('/') || raw.contains('\\') {
        return true;
    }
    match file_extension(raw) {
        Some(extension) => {
            ASSET_EXTENSIONS.contains(&extension.as_str())
                || CONFIG_EXTENSIONS.contains(&extension.as_str())
        }
        None => false,
    }
}

fn file_extension(raw: &str) -> Option<String> {
    Path::new(raw)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
}

fn strip_verbatim(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

fn normalize_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::CurDir => {}
            other => normalized.push(other.as_os_str()),
        }
    }
    strip_verbatim(&normalized)
}

fn component_eq(left: &std::ffi::OsStr, right: &std::ffi::OsStr) -> bool {
    if cfg!(windows) {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    } else {
        left == right
    }
}

fn path_within_root(root: &Path, candidate: &Path) -> bool {
    let mut root_components = root.components();
    let mut candidate_components = candidate.components();

    loop {
        match (root_components.next(), candidate_components.next()) {
            (None, _) => return true,
            (Some(root_part), Some(candidate_part)) => {
                if !component_eq(root_part.as_os_str(), candidate_part.as_os_str()) {
                    return false;
                }
            }
            (Some(_), None) => return false,
        }
    }
}

fn relative_to_root(root: &Path, file: &Path) -> Option<String> {
    let root_parts: Vec<String> = root
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    let file_parts: Vec<String> = file
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();

    if file_parts.len() < root_parts.len() {
        return None;
    }
    for index in 0..root_parts.len() {
        let same = if cfg!(windows) {
            root_parts[index].eq_ignore_ascii_case(&file_parts[index])
        } else {
            root_parts[index] == file_parts[index]
        };
        if !same {
            return None;
        }
    }

    let rest = &file_parts[root_parts.len()..];
    if rest.is_empty() {
        return Some(String::new());
    }
    Some(rest.join("/"))
}

fn normalize_path_key(path: &Path) -> String {
    let text = strip_verbatim(path).to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        text.to_ascii_lowercase()
    } else {
        text
    }
}

fn sha256_hex_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn hash_file(path: &Path, max_hash_bytes: u64) -> (u64, String) {
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    if size > max_hash_bytes {
        return (size, String::new());
    }

    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return (size, String::new()),
    };

    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_BUFFER_BYTES];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => hasher.update(&buffer[..read]),
            Err(_) => return (size, String::new()),
        }
    }

    (size, hex::encode(hasher.finalize()))
}

fn now_iso8601() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_seconds = duration.as_secs() as i64;
    let days = total_seconds.div_euclid(86_400);
    let seconds_of_day = total_seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year,
        month,
        day,
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_position = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_position + 2) / 5 + 1) as u32;
    let month = if month_position < 10 {
        month_position + 3
    } else {
        month_position - 9
    } as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_template_tokens_without_regex() {
        assert_eq!(
            extract_template_tokens("${BLENDER_FOLDER}/Characters/{character-name}"),
            vec!["BLENDER_FOLDER".to_string()]
        );
        assert_eq!(
            extract_template_tokens("$NOT_A_TOKEN ${A} ${B} {C}"),
            vec!["A".to_string(), "B".to_string()]
        );
    }

    #[test]
    fn strips_windows_verbatim_prefix() {
        let stripped = strip_verbatim(Path::new(r"\\?\D:\FullStack\Automation\asset.py"));
        assert_eq!(stripped, PathBuf::from(r"D:\FullStack\Automation\asset.py"));
    }

    #[test]
    fn detects_lexical_escape() {
        let root = PathBuf::from(r"D:\FullStack\Automation");
        let inside = normalize_lexically(Path::new(r"D:\FullStack\Automation\a\..\b.py"));
        let outside = normalize_lexically(Path::new(r"D:\FullStack\Automation\..\secret.txt"));
        assert!(path_within_root(&root, &inside));
        assert!(!path_within_root(&root, &outside));
    }

    #[test]
    fn canonical_hash_ignores_layout_and_labels() {
        let yaml_a: Value = serde_yaml::from_str(
            r#"
nodes:
  - id: start
    tool: Start
  - id: work
    tool: local:blender/save_scene
    label: First label
    inputs:
      preset_path: D:/x.py
      resolution: 4096
"#,
        )
        .expect("yaml");
        let yaml_b: Value = serde_yaml::from_str(
            r#"
nodes:
  - id: work
    tool: local:blender/save_scene
    label: Second label
    inputs:
      resolution: 4096
      preset_path: D:/x.py
  - id: start
    tool: Start
"#,
        )
        .expect("yaml");

        let graph_a = canonical_from_yaml(&yaml_a).expect("graph a");
        let graph_b = canonical_from_yaml(&yaml_b).expect("graph b");
        assert_eq!(graph_a.hash, graph_b.hash);
    }

    #[test]
    fn canonical_hash_changes_with_config() {
        let yaml_a: Value = serde_yaml::from_str(
            "nodes:\n  - id: work\n    tool: local:blender/save_scene\n    inputs:\n      resolution: 4096\n",
        )
        .expect("yaml");
        let yaml_b: Value = serde_yaml::from_str(
            "nodes:\n  - id: work\n    tool: local:blender/save_scene\n    inputs:\n      resolution: 2048\n",
        )
        .expect("yaml");

        assert_ne!(
            canonical_from_yaml(&yaml_a).expect("a").hash,
            canonical_from_yaml(&yaml_b).expect("b").hash
        );
    }

    #[test]
    fn formats_iso8601_utc() {
        let stamp = now_iso8601();
        assert!(stamp.ends_with('Z'));
        assert_eq!(stamp.len(), 20);
    }
}
