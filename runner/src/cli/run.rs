use anyhow::{bail, Context, Result};
use colored::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Deserialize)]
pub struct WorkspaceFolderConfig {
    pub namespace: String,
    pub path: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct ForgityWorkspaceConfig {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "primaryPipelineFolder", default = "default_pipelines")]
    pub primary_pipeline_folder: String,
    #[serde(rename = "scriptFolders", default)]
    pub script_folders: Vec<WorkspaceFolderConfig>,
}

fn default_pipelines() -> String {
    "pipelines".to_string()
}

#[derive(Debug, Deserialize)]
pub struct PipelineYamlNode {
    pub id: String,
    pub tool: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub inputs: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
pub struct PipelineYamlEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Deserialize)]
pub struct PipelineYamlDocument {
    pub name: String,
    #[serde(default)]
    pub nodes: Vec<PipelineYamlNode>,
    #[serde(default)]
    pub edges: Option<Vec<PipelineYamlEdge>>,
}

#[derive(Debug, Serialize)]
pub struct SavePipelineNodeItem {
    pub id: Option<String>,
    #[serde(rename = "refId")]
    pub ref_id: String,
    pub kind: u32,
    #[serde(rename = "positionX")]
    pub position_x: f32,
    #[serde(rename = "positionY")]
    pub position_y: f32,
    #[serde(rename = "configValues")]
    pub config_values: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize)]
pub struct SavePipelineEdgeItem {
    pub id: Option<String>,
    #[serde(rename = "sourceNodeId")]
    pub source_node_id: String,
    #[serde(rename = "sourcePin")]
    pub source_pin: String,
    #[serde(rename = "targetNodeId")]
    pub target_node_id: String,
    #[serde(rename = "targetPin")]
    pub target_pin: String,
}

#[derive(Debug, Serialize)]
pub struct RunDraftPipelineRequest {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "pipelineName")]
    pub pipeline_name: String,
    #[serde(rename = "graph")]
    pub graph: DraftGraphDto,
    #[serde(rename = "transientNodeDefinitions")]
    pub transient_node_definitions: Vec<serde_json::Value>,
    #[serde(rename = "preferredRunnerId")]
    pub preferred_runner_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DraftGraphDto {
    pub nodes: Vec<SavePipelineNodeItem>,
    pub edges: Vec<SavePipelineEdgeItem>,
}

#[derive(Debug, Deserialize)]
pub struct PipelineExecutionResponse {
    pub id: String,
    pub status: serde_json::Value,
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NodeExecutionDto {
    #[serde(rename = "nodeId")]
    pub node_id: String,
    pub status: serde_json::Value,
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
    pub output: Option<serde_json::Value>,
    pub log: Option<serde_json::Value>,
}

pub async fn run_pipeline_file(
    yaml_path: &Path,
    project_override: Option<&str>,
    report_path: Option<&Path>,
) -> Result<()> {
    println!("{}", "=== Forgity Headless Pipeline Runner ===".bold().cyan());

    if !yaml_path.is_file() {
        bail!("Pipeline YAML file not found: {}", yaml_path.display());
    }

    // 1. Locate forgity.workspace.json
    let workspace_config = find_workspace_config(yaml_path)?;
    let project_id = project_override
        .map(|s| s.to_string())
        .or_else(|| workspace_config.as_ref().map(|w| w.project_id.clone()))
        .unwrap_or_else(|| "00000000-0000-0000-0000-000000000000".to_string());

    println!("{} {}", "Project ID:".bold(), project_id.green());
    println!("{} {}", "Loading YAML:".bold(), yaml_path.display());

    // 2. Parse YAML
    let yaml_content = std::fs::read_to_string(yaml_path)
        .with_context(|| format!("Failed to read {}", yaml_path.display()))?;
    let doc: PipelineYamlDocument = serde_yaml::from_str(&yaml_content)
        .with_context(|| "Failed to parse pipeline YAML document")?;

    println!("{} {} ({} nodes)", "Pipeline:".bold(), doc.name.yellow(), doc.nodes.len());

    // 3. Scan local script definitions used
    let mut transient_node_defs = Vec::new();
    if let Some(ref ws) = workspace_config {
        for node in &doc.nodes {
            if node.tool.starts_with("local:") {
                let clean_key = &node.tool[6..];
                if let Some(def) = resolve_local_script_definition(clean_key, ws) {
                    transient_node_defs.push(def);
                }
            }
        }
    }

    // 4. Map into SavePipelineNodeItem / EdgeItem
    let mut save_nodes = Vec::new();
    let mut current_x = 100.0;
    let current_y = 100.0;

    for node in &doc.nodes {
        save_nodes.push(SavePipelineNodeItem {
            id: Some(node.id.clone()),
            ref_id: node.tool.clone(),
            kind: 1, // Custom
            position_x: current_x,
            position_y: current_y,
            config_values: node.inputs.clone(),
        });
        current_x += 250.0;
    }

    let mut save_edges = Vec::new();
    if let Some(ref edges) = doc.edges {
        for (idx, e) in edges.iter().enumerate() {
            let (src_node, src_pin) = split_pin_ref(&e.from);
            let (tgt_node, tgt_pin) = split_pin_ref(&e.to);
            save_edges.push(SavePipelineEdgeItem {
                id: Some(format!("e-{}", idx)),
                source_node_id: src_node,
                source_pin: src_pin,
                target_node_id: tgt_node,
                target_pin: tgt_pin,
            });
        }
    }

    // 5. Read runner.toml for API URL and Runner ID
    let (cfg_opt, _) = crate::config::load_config(None, false).unwrap_or((None, crate::config::ConfigSource::Global(PathBuf::new())));
    let api_url = cfg_opt
        .as_ref()
        .map(|c| c.api_url.trim_end_matches('/').to_string())
        .unwrap_or_else(|| "http://localhost:5189".to_string());
    let preferred_runner_id = cfg_opt.as_ref().map(|c| c.runner_id.clone());

    let client = reqwest::Client::new();
    let run_draft_url = format!("{}/api/pipeline/pipelines/run-draft", api_url);

    let run_payload = RunDraftPipelineRequest {
        project_id: project_id.clone(),
        pipeline_name: doc.name.clone(),
        graph: DraftGraphDto {
            nodes: save_nodes,
            edges: save_edges,
        },
        transient_node_definitions: transient_node_defs,
        preferred_runner_id,
    };

    println!("{} Submitting ephemeral execution to API...", "->".cyan());
    let response = client
        .post(&run_draft_url)
        .json(&run_payload)
        .send()
        .await
        .with_context(|| format!("Failed to connect to API at {}", run_draft_url))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        bail!("API rejected pipeline run: {}", err_text);
    }

    let exec_res: PipelineExecutionResponse = response.json().await?;
    let execution_id = exec_res.id;
    println!("{} {}", "Execution Started:".bold().green(), execution_id.yellow());

    // 6. Polling loop
    let get_exec_url = format!("{}/api/pipeline/pipelines/executions/{}", api_url, execution_id);
    let mut finished = false;
    let mut last_status = String::new();

    while !finished {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        let poll_res = client.get(&get_exec_url).send().await;
        if let Ok(res) = poll_res {
            if let Ok(item) = res.json::<PipelineExecutionResponse>().await {
                let status_str = match &item.status {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Number(n) => format!("{}", n),
                    _ => format!("{:?}", item.status),
                };

                if status_str != last_status {
                    println!("{} Status: {}", "->".cyan(), status_str.bold());
                    last_status = status_str.clone();
                }

                if status_str == "Completed" || status_str == "2" {
                    println!("{}", "✓ Pipeline Execution Completed Successfully!".bold().green());
                    finished = true;
                } else if status_str == "Failed" || status_str == "3" {
                    println!("{}", "✗ Pipeline Execution Failed!".bold().red());
                    if let Some(err) = item.error_message {
                        println!("{} {}", "Error:".bold().red(), err);
                    }
                    finished = true;
                } else if status_str == "Cancelled" || status_str == "4" {
                    println!("{}", "Pipeline Execution Cancelled.".yellow());
                    finished = true;
                }
            }
        }
    }

    // 7. Fetch Node Executions Details & generate report
    let get_nodes_url = format!("{}/api/pipeline/pipelines/executions/{}/node-executions", api_url, execution_id);
    let nodes_res = client.get(&get_nodes_url).send().await;
    let node_execs: Vec<NodeExecutionDto> = match nodes_res {
        Ok(res) if res.status().is_success() => res.json().await.unwrap_or_default(),
        _ => Vec::new(),
    };

    println!("\n{}", "--- Node Execution Summary ---".bold());
    for ne in &node_execs {
        let status = match &ne.status {
            serde_json::Value::String(s) => s.clone(),
            _ => format!("{:?}", ne.status),
        };
        let status_colored = if status == "Completed" || status == "2" {
            status.green()
        } else if status == "Failed" || status == "3" {
            status.red()
        } else {
            status.yellow()
        };

        println!(" • Node [{}] => {}", ne.node_id.cyan(), status_colored);
        if let Some(ref err) = ne.error_message {
            println!("    Error: {}", err.red());
        }
    }

    if let Some(rep_path) = report_path {
        let report_obj = serde_json::json!({
            "executionId": execution_id,
            "pipelineName": doc.name,
            "status": last_status,
            "nodeExecutions": node_execs,
        });
        let json_str = serde_json::to_string_pretty(&report_obj)?;
        std::fs::write(rep_path, json_str)?;
        println!("\n{} Report saved to: {}", "✓".green(), rep_path.display().to_string().cyan());
    }

    Ok(())
}

fn split_pin_ref(pin_ref: &str) -> (String, String) {
    if let Some((node, pin)) = pin_ref.split_once('.') {
        (node.to_string(), pin.to_string())
    } else {
        (pin_ref.to_string(), "out".to_string())
    }
}

fn find_workspace_config(yaml_path: &Path) -> Result<Option<ForgityWorkspaceConfig>> {
    let mut cur = if yaml_path.is_file() {
        yaml_path.parent().map(|p| p.to_path_buf())
    } else {
        Some(yaml_path.to_path_buf())
    };

    while let Some(dir) = cur {
        let candidate = dir.join("forgity.workspace.json");
        if candidate.is_file() {
            let content = std::fs::read_to_string(&candidate)?;
            let cfg: ForgityWorkspaceConfig = serde_json::from_str(&content)?;
            return Ok(Some(cfg));
        }
        cur = dir.parent().map(|p| p.to_path_buf());
    }
    Ok(None)
}

fn resolve_local_script_definition(key: &str, ws: &ForgityWorkspaceConfig) -> Option<serde_json::Value> {
    let (ns, rel_path) = key.split_once(':')?;
    for folder in &ws.script_folders {
        if folder.enabled && folder.namespace == ns {
            let root = Path::new(&folder.path);
            let candidates = [
                root.join(format!("{}.py", rel_path)),
                root.join(rel_path),
            ];

            for cand in candidates {
                if cand.is_file() {
                    let content = std::fs::read_to_string(&cand).ok()?;
                    let mut hasher = Sha256::new();
                    hasher.update(content.as_bytes());
                    let hash = format!("{:x}", hasher.finalize());
                    let file_name = cand.file_name()?.to_string_lossy().to_string();

                    return Some(serde_json::json!({
                        "key": key,
                        "name": file_name,
                        "label": file_name,
                        "executor": guess_executor(&cand),
                        "contentHash": hash,
                        "sourceRepositoryPath": cand.to_string_lossy().replace('\\', "/"),
                        "inputs": [],
                        "outputs": []
                    }));
                }
            }
        }
    }
    None
}

fn guess_executor(path: &Path) -> &'static str {
    let s = path.to_string_lossy().to_lowercase();
    if s.contains("blender") {
        "blender"
    } else if s.contains("unreal") {
        "unreal"
    } else {
        "python"
    }
}

