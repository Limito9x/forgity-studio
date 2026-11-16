use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PipelineKind {
    Master,
    Component,
}

impl PipelineKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            PipelineKind::Master => "master",
            PipelineKind::Component => "component",
        }
    }

    pub fn from_str_lossy(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "master" => Some(PipelineKind::Master),
            "component" => Some(PipelineKind::Component),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValidationSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub code: String,
    pub severity: ValidationSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub valid: bool,
    pub pipeline_kind: PipelineKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor: Option<String>,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineKindContract {
    pub kind: PipelineKind,
    pub requires_executor: bool,
    pub allow_pure_nodes: bool,
    pub allow_component_nodes: bool,
    pub allow_raw_script_nodes: bool,
    pub allow_python_scripts_in_dcc: bool,
    pub python_capable_executors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineContractSpec {
    pub version: String,
    pub master: PipelineKindContract,
    pub component: PipelineKindContract,
}

/// Minimal node metadata needed for contract validation (compatible with palette items).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaletteNodeSummary {
    pub key: String,
    pub source: String,
    pub executor: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub has_exec_pins: bool,
}

/// Returns the canonical Pipeline Contract Specification (Single Source of Truth).
pub fn get_pipeline_contract_spec() -> PipelineContractSpec {
    let python_capable = vec![
        "blender".to_string(),
        "unreal".to_string(),
        "daz".to_string(),
        "python".to_string(),
    ];

    PipelineContractSpec {
        version: "1.0".to_string(),
        master: PipelineKindContract {
            kind: PipelineKind::Master,
            requires_executor: false,
            allow_pure_nodes: true,
            allow_component_nodes: true,
            allow_raw_script_nodes: false,
            allow_python_scripts_in_dcc: false,
            python_capable_executors: python_capable.clone(),
        },
        component: PipelineKindContract {
            kind: PipelineKind::Component,
            requires_executor: true,
            allow_pure_nodes: false,
            allow_component_nodes: false,
            allow_raw_script_nodes: true,
            allow_python_scripts_in_dcc: true,
            python_capable_executors: python_capable,
        },
    }
}

/// Checks whether a palette item is allowed inside a given pipeline context.
pub fn is_palette_item_allowed(
    item: &PaletteNodeSummary,
    pipeline_kind: PipelineKind,
    pipeline_executor: Option<&str>,
) -> bool {
    let key_lower = item.key.to_ascii_lowercase();
    let source_lower = item.source.to_ascii_lowercase();
    let exec_lower = item.executor.to_ascii_lowercase();
    let category_lower = item.category.to_ascii_lowercase();

    // Start / Return / Constant are always allowed in both Master and Component
    if matches!(key_lower.as_str(), "start" | "return")
        || matches!(source_lower.as_str(), "constant" | "builtin")
        || key_lower.starts_with("local:constant:")
    {
        return true;
    }

    let is_pure = exec_lower == "pure" || key_lower.starts_with("local:pure:");
    let is_component = source_lower == "subpipeline"
        || category_lower == "components"
        || key_lower.starts_with("local:component:");

    match pipeline_kind {
        PipelineKind::Master => {
            if is_pure || is_component {
                return true;
            }
            // Raw DCC / Python scripts are NOT allowed directly in Master
            false
        }
        PipelineKind::Component => {
            if is_pure || is_component {
                return false;
            }
            let Some(target_exec) = pipeline_executor
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty())
            else {
                // Without a declared component executor, allow scripts so user can still inspect
                return true;
            };
            if exec_lower == target_exec {
                return true;
            }
            let spec = get_pipeline_contract_spec();
            if exec_lower == "python"
                && spec
                    .component
                    .python_capable_executors
                    .iter()
                    .any(|e| e == &target_exec)
            {
                return true;
            }
            false
        }
    }
}

/// Graph node input used for contract validation (either from YAML or UI canvas).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractGraphNode {
    pub id: String,
    pub tool: String,
    #[serde(default)]
    pub kind: Option<String>,
}

/// Graph edge input used for contract validation.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractGraphEdge {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub is_exec: bool,
}

/// Validates a pipeline graph against the canonical Contract Specification.
pub fn validate_pipeline_graph(
    pipeline_kind: PipelineKind,
    executor: Option<&str>,
    nodes: &[ContractGraphNode],
    edges: &[ContractGraphEdge],
    palette_lookup: Option<&HashMap<String, PaletteNodeSummary>>,
    missing_root_kind_warning: bool,
) -> ValidationReport {
    let mut issues: Vec<ValidationIssue> = Vec::new();

    if missing_root_kind_warning {
        issues.push(ValidationIssue {
            code: "MISSING_ROOT_KIND".to_string(),
            severity: ValidationSeverity::Warning,
            message: "Pipeline YAML is missing explicit root 'kind' ('master' or 'component'); inferred from path/filename.".to_string(),
            node_id: None,
        });
    }

    let normalized_exec = executor
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty());

    if pipeline_kind == PipelineKind::Component {
        match normalized_exec.as_deref() {
            None => {
                issues.push(ValidationIssue {
                    code: "COMPONENT_MISSING_EXECUTOR".to_string(),
                    severity: ValidationSeverity::Error,
                    message: "Component Pipe must declare a root 'executor' (e.g. 'blender', 'unreal', 'daz', 'python').".to_string(),
                    node_id: None,
                });
            }
            Some("pure") | Some("builtin") => {
                issues.push(ValidationIssue {
                    code: "COMPONENT_INVALID_EXECUTOR".to_string(),
                    severity: ValidationSeverity::Error,
                    message: format!(
                        "Component Pipe cannot use '{}' as its executor; choose a concrete stage executor like 'blender', 'unreal', 'daz', or 'python'.",
                        normalized_exec.as_deref().unwrap_or_default()
                    ),
                    node_id: None,
                });
            }
            _ => {}
        }
    }

    // 1. Start node checks
    let start_nodes: Vec<&ContractGraphNode> = nodes
        .iter()
        .filter(|n| is_start_node(&n.tool, n.kind.as_deref()))
        .collect();

    if !nodes.is_empty() && start_nodes.is_empty() {
        issues.push(ValidationIssue {
            code: "MISSING_START_NODE".to_string(),
            severity: ValidationSeverity::Error,
            message: "Pipeline must contain a Start node.".to_string(),
            node_id: None,
        });
    } else if start_nodes.len() > 1 {
        issues.push(ValidationIssue {
            code: "MULTIPLE_START_NODES".to_string(),
            severity: ValidationSeverity::Error,
            message: "Pipeline can only contain one Start node.".to_string(),
            node_id: Some(start_nodes[1].id.clone()),
        });
    }

    // 2. Per-node contract rules (Master vs Component)
    for node in nodes {
        let tool_lower = node.tool.trim().to_ascii_lowercase();
        let kind_lower = node
            .kind
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();

        if is_start_node(&node.tool, node.kind.as_deref())
            || is_return_node(&node.tool, node.kind.as_deref())
            || is_constant_node(&node.tool, node.kind.as_deref())
        {
            continue;
        }

        let is_pure = tool_lower.starts_with("local:pure:")
            || tool_lower == "joint"
            || kind_lower == "pure";
        let is_component_ref = tool_lower.starts_with("local:component:")
            || kind_lower == "subpipeline";

        if pipeline_kind == PipelineKind::Component {
            if is_pure {
                issues.push(ValidationIssue {
                    code: "PURE_NODE_FORBIDDEN_IN_COMPONENT".to_string(),
                    severity: ValidationSeverity::Error,
                    message: format!(
                        "Pure/orchestration node '{}' ({}) is only allowed in Master Pipelines, not inside a Component Pipe.",
                        node.id, node.tool
                    ),
                    node_id: Some(node.id.clone()),
                });
                continue;
            }
            if is_component_ref {
                issues.push(ValidationIssue {
                    code: "COMPONENT_FORBIDDEN_IN_COMPONENT".to_string(),
                    severity: ValidationSeverity::Error,
                    message: format!(
                        "Component node '{}' ({}) cannot be nested inside another Component Pipe.",
                        node.id, node.tool
                    ),
                    node_id: Some(node.id.clone()),
                });
                continue;
            }
        } else if pipeline_kind == PipelineKind::Master {
            if !is_pure && !is_component_ref && tool_lower.starts_with("local:script:") {
                issues.push(ValidationIssue {
                    code: "SCRIPT_FORBIDDEN_IN_MASTER".to_string(),
                    severity: ValidationSeverity::Error,
                    message: format!(
                        "Raw script node '{}' ({}) is not allowed directly in a Master Pipeline; wrap it in a Component Pipe.",
                        node.id, node.tool
                    ),
                    node_id: Some(node.id.clone()),
                });
                continue;
            }
        }

        if let Some(lookup) = palette_lookup {
            if let Some(meta) = lookup.get(&tool_lower) {
                if !is_palette_item_allowed(meta, pipeline_kind, normalized_exec.as_deref()) {
                    let msg = match pipeline_kind {
                        PipelineKind::Master => format!(
                            "Node '{}' ({}, executor '{}') is not allowed in a Master Pipeline.",
                            node.id, node.tool, meta.executor
                        ),
                        PipelineKind::Component => format!(
                            "Node '{}' ({}, executor '{}') is incompatible with Component Pipe executor '{}'.",
                            node.id,
                            node.tool,
                            meta.executor,
                            normalized_exec.as_deref().unwrap_or("unknown")
                        ),
                    };
                    issues.push(ValidationIssue {
                        code: "CONTRACT_NODE_INCOMPATIBLE".to_string(),
                        severity: ValidationSeverity::Error,
                        message: msg,
                        node_id: Some(node.id.clone()),
                    });
                }
            }
        }
    }

    // 3. Cycle detection on edges
    let node_ids: HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut in_degree: HashMap<&str, usize> = nodes.iter().map(|n| (n.id.as_str(), 0)).collect();

    for edge in edges {
        let from_id = split_node_from_endpoint(&edge.from);
        let to_id = split_node_from_endpoint(&edge.to);
        if node_ids.contains(from_id) && node_ids.contains(to_id) {
            adj.entry(from_id).or_default().push(to_id);
            *in_degree.entry(to_id).or_insert(0) += 1;
        }
    }

    let mut queue: VecDeque<&str> = in_degree
        .iter()
        .filter_map(|(&id, &deg)| if deg == 0 { Some(id) } else { None })
        .collect();
    let mut visited_count = 0usize;
    while let Some(u) = queue.pop_front() {
        visited_count += 1;
        if let Some(neighbors) = adj.get(u) {
            for &v in neighbors {
                if let Some(deg) = in_degree.get_mut(v) {
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(v);
                    }
                }
            }
        }
    }

    if !nodes.is_empty() && visited_count < nodes.len() {
        issues.push(ValidationIssue {
            code: "CYCLE_DETECTED".to_string(),
            severity: ValidationSeverity::Error,
            message: "Pipeline graph contains a cycle; DAG execution requires an acyclic graph.".to_string(),
            node_id: None,
        });
    }

    // 4. Orphan Exec nodes check (when Start exists and edges have exec info)
    if let Some(start) = start_nodes.first() {
        let mut exec_adj: HashMap<&str, Vec<&str>> = HashMap::new();
        for edge in edges {
            let from_id = split_node_from_endpoint(&edge.from);
            let to_id = split_node_from_endpoint(&edge.to);
            let is_exec_edge = edge.is_exec
                || endpoint_looks_like_exec(&edge.from)
                || endpoint_looks_like_exec(&edge.to);
            if is_exec_edge && node_ids.contains(from_id) && node_ids.contains(to_id) {
                exec_adj.entry(from_id).or_default().push(to_id);
            }
        }

        let mut reachable: HashSet<&str> = HashSet::new();
        let mut q: VecDeque<&str> = VecDeque::new();
        reachable.insert(start.id.as_str());
        q.push_back(start.id.as_str());
        while let Some(u) = q.pop_front() {
            if let Some(neighbors) = exec_adj.get(u) {
                for &v in neighbors {
                    if reachable.insert(v) {
                        q.push_back(v);
                    }
                }
            }
        }

        for node in nodes {
            if is_start_node(&node.tool, node.kind.as_deref())
                || is_constant_node(&node.tool, node.kind.as_deref())
            {
                continue;
            }
            let has_exec = palette_lookup
                .and_then(|l| l.get(&node.tool.to_ascii_lowercase()))
                .map(|m| m.has_exec_pins)
                .unwrap_or_else(|| {
                    !is_constant_node(&node.tool, node.kind.as_deref())
                });

            if has_exec && !reachable.contains(node.id.as_str()) {
                issues.push(ValidationIssue {
                    code: "ORPHAN_EXEC_NODE".to_string(),
                    severity: ValidationSeverity::Error,
                    message: format!(
                        "Node '{}' ({}) is unreachable from Start via Exec pins.",
                        node.id, node.tool
                    ),
                    node_id: Some(node.id.clone()),
                });
            }
        }
    }

    let valid = !issues
        .iter()
        .any(|i| i.severity == ValidationSeverity::Error);

    ValidationReport {
        valid,
        pipeline_kind,
        executor: normalized_exec,
        issues,
    }
}

/// Parses a `.pipeline.yaml` / `.component.yaml` document and validates it against the Contract.
pub fn validate_pipeline_yaml(
    yaml_content: &str,
    path_hint: Option<&str>,
    palette_lookup: Option<&HashMap<String, PaletteNodeSummary>>,
) -> ValidationReport {
    let doc: Value = match serde_yaml::from_str(yaml_content) {
        Ok(v) => v,
        Err(err) => {
            return ValidationReport {
                valid: false,
                pipeline_kind: infer_kind_from_path(path_hint).unwrap_or(PipelineKind::Master),
                executor: None,
                issues: vec![ValidationIssue {
                    code: "YAML_PARSE_ERROR".to_string(),
                    severity: ValidationSeverity::Error,
                    message: format!("Invalid YAML syntax: {}", err),
                    node_id: None,
                }],
            };
        }
    };

    let explicit_kind = doc
        .get("kind")
        .and_then(|v| v.as_str())
        .and_then(PipelineKind::from_str_lossy);

    let (pipeline_kind, missing_root_kind_warning) = match explicit_kind {
        Some(k) => (k, false),
        None => (
            infer_kind_from_path(path_hint).unwrap_or(PipelineKind::Master),
            true,
        ),
    };

    let executor = doc
        .get("executor")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut nodes: Vec<ContractGraphNode> = Vec::new();
    if let Some(arr) = doc.get("nodes").and_then(|v| v.as_array()) {
        for item in arr {
            let id = item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool = item
                .get("tool")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let kind = item
                .get("kind")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if !id.is_empty() {
                nodes.push(ContractGraphNode { id, tool, kind });
            }
        }
    }

    let mut edges: Vec<ContractGraphEdge> = Vec::new();
    if let Some(arr) = doc.get("edges").and_then(|v| v.as_array()) {
        for item in arr {
            let from = item
                .get("from")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let to = item
                .get("to")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !from.is_empty() && !to.is_empty() {
                let is_exec = endpoint_looks_like_exec(&from) || endpoint_looks_like_exec(&to);
                edges.push(ContractGraphEdge { from, to, is_exec });
            }
        }
    }

    validate_pipeline_graph(
        pipeline_kind,
        executor.as_deref(),
        &nodes,
        &edges,
        palette_lookup,
        missing_root_kind_warning,
    )
}

fn infer_kind_from_path(path_hint: Option<&str>) -> Option<PipelineKind> {
    let hint = path_hint?.replace('\\', "/").to_ascii_lowercase();
    if hint.ends_with(".component.yaml")
        || hint.ends_with(".component.yml")
        || hint.contains("/components/")
    {
        Some(PipelineKind::Component)
    } else {
        Some(PipelineKind::Master)
    }
}

fn is_start_node(tool: &str, kind: Option<&str>) -> bool {
    tool.eq_ignore_ascii_case("start")
        || kind.map(|k| k.eq_ignore_ascii_case("start")).unwrap_or(false)
}

fn is_return_node(tool: &str, kind: Option<&str>) -> bool {
    tool.eq_ignore_ascii_case("return")
        || tool.eq_ignore_ascii_case("end")
        || kind
            .map(|k| k.eq_ignore_ascii_case("return"))
            .unwrap_or(false)
}

fn is_constant_node(tool: &str, kind: Option<&str>) -> bool {
    let t = tool.to_ascii_lowercase();
    t.starts_with("local:constant:")
        || kind
            .map(|k| k.eq_ignore_ascii_case("constant"))
            .unwrap_or(false)
}

fn split_node_from_endpoint(endpoint: &str) -> &str {
    endpoint.split('.').next().unwrap_or(endpoint)
}

fn endpoint_looks_like_exec(endpoint: &str) -> bool {
    endpoint
        .split('.')
        .nth(1)
        .map(|pin| pin.eq_ignore_ascii_case("exec") || pin.eq_ignore_ascii_case("__exec__"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn component_pipe_rejects_joint_node() {
        let yaml = r#"
name: daz_clothes_to_blender
kind: component
executor: blender
nodes:
  - id: start
    tool: Start
  - id: joint_1
    tool: local:pure:joint
  - id: end
    tool: Return
edges:
  - from: start.Exec
    to: joint_1.Exec
  - from: joint_1.Exec
    to: end.Exec
"#;
        let report = validate_pipeline_yaml(yaml, Some("components/daz_clothes.pipeline.yaml"), None);
        assert!(!report.valid);
        assert!(report
            .issues
            .iter()
            .any(|i| i.code == "PURE_NODE_FORBIDDEN_IN_COMPONENT"));
    }

    #[test]
    fn master_pipeline_allows_joint_and_components_but_rejects_raw_script() {
        let yaml = r#"
name: daz_to_unreal
kind: master
nodes:
  - id: start
    tool: Start
  - id: comp_1
    tool: local:component:daz_to_blender
  - id: joint_1
    tool: local:pure:joint
  - id: raw_script
    tool: local:script:blender/bake.py
  - id: end
    tool: Return
edges:
  - from: start.Exec
    to: comp_1.Exec
  - from: comp_1.Exec
    to: joint_1.Exec
  - from: joint_1.Exec
    to: raw_script.Exec
  - from: raw_script.Exec
    to: end.Exec
"#;
        let report = validate_pipeline_yaml(yaml, Some("daz_to_unreal.pipeline.yaml"), None);
        assert!(!report.valid);
        assert!(report
            .issues
            .iter()
            .any(|i| i.code == "SCRIPT_FORBIDDEN_IN_MASTER"));
        assert!(!report
            .issues
            .iter()
            .any(|i| i.code == "PURE_NODE_FORBIDDEN_IN_COMPONENT"));
    }

    #[test]
    fn palette_filter_hides_pure_in_component_and_hides_raw_scripts_in_master() {
        let joint = PaletteNodeSummary {
            key: "local:pure:joint".to_string(),
            source: "Pure".to_string(),
            executor: "pure".to_string(),
            category: "Pure".to_string(),
            has_exec_pins: true,
        };
        let blender_script = PaletteNodeSummary {
            key: "local:script:blender/bake.py".to_string(),
            source: "LocalDraft".to_string(),
            executor: "blender".to_string(),
            category: "Blender".to_string(),
            has_exec_pins: true,
        };
        let component_node = PaletteNodeSummary {
            key: "local:component:daz_to_blender".to_string(),
            source: "SubPipeline".to_string(),
            executor: "blender".to_string(),
            category: "Components".to_string(),
            has_exec_pins: true,
        };

        assert!(!is_palette_item_allowed(&joint, PipelineKind::Component, Some("blender")));
        assert!(is_palette_item_allowed(&joint, PipelineKind::Master, None));

        assert!(is_palette_item_allowed(&blender_script, PipelineKind::Component, Some("blender")));
        assert!(!is_palette_item_allowed(&blender_script, PipelineKind::Component, Some("unreal")));
        assert!(!is_palette_item_allowed(&blender_script, PipelineKind::Master, None));

        assert!(is_palette_item_allowed(&component_node, PipelineKind::Master, None));
        assert!(!is_palette_item_allowed(&component_node, PipelineKind::Component, Some("blender")));
    }
}
