use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

pub async fn run_mcp_server(workspace_dir: Option<PathBuf>) -> Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    let root_dir = workspace_dir
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let req: JsonRpcRequest = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                let err_res = json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": { "code": -32700, "message": format!("Parse error: {}", e) }
                });
                writeln!(stdout, "{}", serde_json::to_string(&err_res)?)?;
                stdout.flush()?;
                continue;
            }
        };

        let id = req.id.unwrap_or(Value::Null);

        match req.method.as_str() {
            "initialize" => {
                let res = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id,
                    result: Some(json!({
                        "protocolVersion": "2024-11-05",
                        "serverInfo": {
                            "name": "forgity-mcp",
                            "version": env!("FORGITY_RUNNER_VERSION")
                        },
                        "capabilities": {
                            "tools": {}
                        }
                    })),
                    error: None,
                };
                writeln!(stdout, "{}", serde_json::to_string(&res)?)?;
                stdout.flush()?;
            }
            "notifications/initialized" => {
                // Client ack, no response needed for notifications
            }
            "tools/list" => {
                let res = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id,
                    result: Some(json!({
                        "tools": [
                            {
                                "name": "get_palette_nodes",
                                "description": "Scan and return all available local workspace scripts and tools for building DAG pipelines",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "workspacePath": {
                                            "type": "string",
                                            "description": "Optional path to the project root containing forgity.workspace.json"
                                        }
                                    }
                                }
                            },
                            {
                                "name": "validate_pipeline_yaml",
                                "description": "Validate the structural syntax and script references of a .pipeline.yaml file",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "pipelinePath": {
                                            "type": "string",
                                            "description": "Path to the .pipeline.yaml file"
                                        }
                                    },
                                    "required": ["pipelinePath"]
                                }
                            }
                        ]
                    })),
                    error: None,
                };
                writeln!(stdout, "{}", serde_json::to_string(&res)?)?;
                stdout.flush()?;
            }
            "tools/call" => {
                let params = req.params.unwrap_or(Value::Null);
                let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));

                let result_value = match tool_name {
                    "get_palette_nodes" => {
                        let ws_path = args.get("workspacePath")
                            .and_then(|v| v.as_str())
                            .map(PathBuf::from)
                            .unwrap_or_else(|| root_dir.clone());
                        handle_get_palette_nodes(&ws_path)
                    }
                    "validate_pipeline_yaml" => {
                        let pip_path = args.get("pipelinePath")
                            .and_then(|v| v.as_str())
                            .map(PathBuf::from)
                            .unwrap_or_else(|| PathBuf::from(""));
                        handle_validate_pipeline_yaml(&pip_path, &root_dir)
                    }
                    _ => json!({
                        "isError": true,
                        "content": [{ "type": "text", "text": format!("Unknown tool: {}", tool_name) }]
                    }),
                };

                let res = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id,
                    result: Some(result_value),
                    error: None,
                };
                writeln!(stdout, "{}", serde_json::to_string(&res)?)?;
                stdout.flush()?;
            }
            _ => {
                let res = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id,
                    result: None,
                    error: Some(json!({
                        "code": -32601,
                        "message": format!("Method not found: {}", req.method)
                    })),
                };
                writeln!(stdout, "{}", serde_json::to_string(&res)?)?;
                stdout.flush()?;
            }
        }
    }

    Ok(())
}

fn handle_get_palette_nodes(workspace_root: &Path) -> Value {
    let ws_config_path = workspace_root.join("forgity.workspace.json");
    if !ws_config_path.is_file() {
        return json!({
            "content": [{
                "type": "text",
                "text": format!("No forgity.workspace.json found at {}. Using empty palette.", workspace_root.display())
            }]
        });
    }

    let Ok(content) = std::fs::read_to_string(&ws_config_path) else {
        return json!({
            "isError": true,
            "content": [{ "type": "text", "text": "Failed to read forgity.workspace.json" }]
        });
    };

    let Ok(cfg) = serde_json::from_str::<Value>(&content) else {
        return json!({
            "isError": true,
            "content": [{ "type": "text", "text": "Failed to parse forgity.workspace.json" }]
        });
    };

    let mut nodes = Vec::new();

    if let Some(folders) = cfg.get("scriptFolders").and_then(|v| v.as_array()) {
        for f in folders {
            let enabled = f.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            if !enabled {
                continue;
            }
            let ns = f.get("namespace").and_then(|v| v.as_str()).unwrap_or("custom");
            let path_str = f.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let dir_path = workspace_root.join(path_str);

            if dir_path.is_dir() {
                scan_py_files(&dir_path, &dir_path, ns, &mut nodes);
            }
        }
    }

    json!({
        "content": [{
            "type": "text",
            "text": serde_json::to_string_pretty(&json!({
                "nodesCount": nodes.len(),
                "paletteNodes": nodes
            })).unwrap_or_default()
        }]
    })
}

fn scan_py_files(root: &Path, current: &Path, namespace: &str, results: &mut Vec<Value>) {
    let Ok(entries) = std::fs::read_dir(current) else {
        return;
    };

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name != "__pycache__" && name != ".venv" && name != "venv" && name != "node_modules" {
                scan_py_files(root, &p, namespace, results);
            }
        } else if p.is_file() && p.extension().map(|e| e.eq_ignore_ascii_case("py")).unwrap_or(false) {
            let rel = p.strip_prefix(root).unwrap_or(&p).to_string_lossy().replace('\\', "/");
            let rel_no_ext = rel.strip_suffix(".py").or_else(|| rel.strip_suffix(".PY")).unwrap_or(&rel);
            let key = format!("local:{}:{}", namespace, rel_no_ext);
            let file_name = entry.file_name().to_string_lossy().to_string();

            let executor = if rel.contains("blender") {
                "blender"
            } else if rel.contains("unreal") {
                "unreal"
            } else {
                "python"
            };

            results.push(json!({
                "key": key,
                "label": file_name,
                "executor": executor,
                "filePath": p.to_string_lossy().replace('\\', "/"),
                "relativePath": rel,
            }));
        }
    }
}

fn handle_validate_pipeline_yaml(pipeline_path: &Path, root_dir: &Path) -> Value {
    let target_path = if pipeline_path.is_relative() {
        root_dir.join(pipeline_path)
    } else {
        pipeline_path.to_path_buf()
    };

    if !target_path.is_file() {
        return json!({
            "isError": true,
            "content": [{ "type": "text", "text": format!("File not found: {}", target_path.display()) }]
        });
    }

    let Ok(content) = std::fs::read_to_string(&target_path) else {
        return json!({
            "isError": true,
            "content": [{ "type": "text", "text": "Failed to read pipeline file" }]
        });
    };

    let Ok(doc) = serde_yaml::from_str::<super::run::PipelineYamlDocument>(&content) else {
        return json!({
            "isError": true,
            "content": [{ "type": "text", "text": "Invalid YAML syntax for pipeline document" }]
        });
    };

    let mut diagnostics: Vec<String> = Vec::new();

    if doc.nodes.is_empty() {
        diagnostics.push("Pipeline has 0 nodes defined".to_string());
    }

    let mut node_ids = std::collections::HashSet::new();
    for node in &doc.nodes {
        if !node_ids.insert(node.id.clone()) {
            diagnostics.push(format!("Duplicate node id detected: {}", node.id));
        }
    }

    if let Some(ref edges) = doc.edges {
        for (idx, e) in edges.iter().enumerate() {
            let (src, _) = e.from.split_once('.').unwrap_or((&e.from, ""));
            let (tgt, _) = e.to.split_once('.').unwrap_or((&e.to, ""));
            if !node_ids.contains(src) {
                diagnostics.push(format!("Edge {} references non-existent source node '{}'", idx, src));
            }
            if !node_ids.contains(tgt) {
                diagnostics.push(format!("Edge {} references non-existent target node '{}'", idx, tgt));
            }
        }
    }

    let is_valid = diagnostics.is_empty();

    json!({
        "content": [{
            "type": "text",
            "text": serde_json::to_string_pretty(&json!({
                "pipelineName": doc.name,
                "nodeCount": doc.nodes.len(),
                "edgeCount": doc.edges.as_ref().map(|e| e.len()).unwrap_or(0),
                "isValid": is_valid,
                "diagnostics": diagnostics
            })).unwrap_or_default()
        }]
    })
}

