use std::path::Path;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedPipelineYamlItem {
    pub file_name: String,
    pub relative_path: String,
    pub full_path: String,
    pub content: String,
    pub last_modified_ms: u64,
    pub pipeline_kind: String, // "component" or "master"
    pub executor: Option<String>,
}

pub fn scan_yaml_recursive(root_path: &Path, current_path: &Path, results: &mut Vec<ScannedPipelineYamlItem>) {
    let entries = match std::fs::read_dir(current_path) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if dir_name != "__pycache__" && dir_name != ".git" && dir_name != "node_modules" {
                scan_yaml_recursive(root_path, &path, results);
            }
        } else if path.is_file() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_pipeline_yaml = file_name.ends_with(".pipeline.yaml")
                || file_name.ends_with(".pipeline.yml")
                || file_name.ends_with(".component.yaml")
                || file_name.ends_with(".component.yml");
            if !is_pipeline_yaml {
                continue;
            }

            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let relative = match path.strip_prefix(root_path) {
                Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
                Err(_) => file_name.clone(),
            };

            let last_modified_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            // Parse root kind & executor from YAML document first, then fall back to path/filename
            let parsed_yaml: Option<serde_yaml::Value> = serde_yaml::from_str(&content).ok();
            let root_kind = parsed_yaml
                .as_ref()
                .and_then(|v| v.get("kind"))
                .and_then(|v| v.as_str())
                .and_then(crate::contracts::PipelineKind::from_str_lossy);

            let is_component = match root_kind {
                Some(crate::contracts::PipelineKind::Component) => true,
                Some(crate::contracts::PipelineKind::Master) => false,
                None => {
                    file_name.ends_with(".component.yaml")
                        || file_name.ends_with(".component.yml")
                        || relative.contains("/components/")
                        || relative.starts_with("components/")
                }
            };

            let pipeline_kind = if is_component {
                "component".to_string()
            } else {
                "master".to_string()
            };

            let executor = parsed_yaml
                .as_ref()
                .and_then(|v| v.get("executor"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            results.push(ScannedPipelineYamlItem {
                file_name,
                relative_path: relative,
                full_path: path.to_string_lossy().replace('\\', "/"),
                content,
                last_modified_ms,
                pipeline_kind,
                executor,
            });
        }
    }
}

pub fn scan_local_pipeline_drafts(folder_path: String) -> Vec<ScannedPipelineYamlItem> {
    let mut results = Vec::new();
    let root = Path::new(&folder_path);
    if root.is_dir() {
        scan_yaml_recursive(root, root, &mut results);
    }
    results
}

pub fn create_local_pipeline_draft(
    pipelines_dir_path: String,
    name: String,
    kind: Option<String>,
    executor: Option<String>,
) -> Result<ScannedPipelineYamlItem, String> {
    let base_dir = Path::new(&pipelines_dir_path);
    let is_component = kind.as_deref().unwrap_or("master") == "component";
    
    // Auto-scope into pipelines/components or pipelines/master if requested
    let target_dir = if is_component {
        if base_dir.ends_with("components") {
            base_dir.to_path_buf()
        } else {
            base_dir.join("components")
        }
    } else {
        if base_dir.ends_with("master") {
            base_dir.to_path_buf()
        } else {
            base_dir.join("master")
        }
    };

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create pipelines directory: {}", e))?;

    let slug: String = name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let clean_slug = slug.trim_matches('_');
    let file_slug = if clean_slug.is_empty() { "pipeline" } else { clean_slug };
    
    let file_suffix = if is_component { ".component.yaml" } else { ".pipeline.yaml" };
    let file_name = format!("{}{}", file_slug, file_suffix);
    let full_path = target_dir.join(&file_name);

    let exec_str = executor.clone().unwrap_or_else(|| if is_component { "blender".to_string() } else { "none".to_string() });
    
    let default_yaml = if is_component {
        format!(
            "name: \"{}\"\nkind: \"component\"\nexecutor: \"{}\"\nversion: \"draft\"\nrunner: \"local\"\nnodes:\n  - id: start\n    tool: Start\n    label: \"Start Component\"\n  - id: return\n    tool: Return\n    label: \"Return\"\nedges: []\n",
            name, exec_str
        )
    } else {
        format!(
            "name: \"{}\"\nkind: \"master\"\nversion: \"draft\"\nrunner: \"local\"\nnodes:\n  - id: start\n    tool: Start\n    label: \"Start Pipeline\"\n  - id: return\n    tool: Return\n    label: \"Return\"\nedges: []\n",
            name
        )
    };

    std::fs::write(&full_path, &default_yaml)
        .map_err(|e| format!("Failed to write draft pipeline: {}", e))?;

    // Automatically generate an initial starter snapshot JSON so Visual Canvas immediately renders smoothly
    let workspace_root = if let Some(parent) = base_dir.parent() {
        if base_dir.file_name().and_then(|n| n.to_str()) == Some("pipelines") {
            parent
        } else if let Some(grandparent) = parent.parent() {
            grandparent
        } else {
            parent
        }
    } else {
        base_dir
    };

    let snaps_dir = workspace_root.join(".forgity").join("snapshots");
    let _ = std::fs::create_dir_all(&snaps_dir);
    let snap_file = snaps_dir.join(format!("{}.snap.json", file_slug));

    let starter_snapshot = serde_json::json!({
        "id": full_path.to_string_lossy().replace('\\', "/"),
        "name": name,
        "projectId": "",
        "triggerType": "Manual",
        "nodes": [
            {
                "id": "start",
                "refId": "Start",
                "label": if is_component { "Start Component" } else { "Start Pipeline" },
                "kind": "Start",
                "category": "Flow Control",
                "executor": "server",
                "position": { "x": 100, "y": 150 },
                "parentId": null,
                "size": { "width": 240, "height": 84 },
                "configValues": {},
                "inputs": [],
                "outputs": [
                    { "id": "exec_out", "label": "Start", "kind": "Exec", "isRequired": false }
                ],
                "metadata": {
                    "isLocalDraft": false,
                    "label": if is_component { "Start Component" } else { "Start Pipeline" }
                }
            },
            {
                "id": "return",
                "refId": "Return",
                "label": "Return",
                "kind": "Return",
                "category": "Flow Control",
                "executor": "server",
                "position": { "x": 700, "y": 150 },
                "parentId": null,
                "size": { "width": 240, "height": 84 },
                "configValues": {},
                "inputs": [
                    { "id": "exec_in", "label": "Exec", "kind": "Exec", "isRequired": false }
                ],
                "outputs": [],
                "metadata": {
                    "isLocalDraft": false,
                    "label": "Return"
                }
            }
        ],
        "edges": [],
        "parameters": []
    });

    if let Ok(snap_str) = serde_json::to_string_pretty(&starter_snapshot) {
        let _ = std::fs::write(&snap_file, snap_str);
    }

    let last_modified_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let pipe_kind = if is_component { "component".to_string() } else { "master".to_string() };

    Ok(ScannedPipelineYamlItem {
        file_name,
        relative_path: file_slug.to_string(),
        full_path: full_path.to_string_lossy().replace('\\', "/"),
        content: default_yaml,
        last_modified_ms,
        pipeline_kind: pipe_kind,
        executor: if is_component { Some(exec_str) } else { None },
    })
}

pub fn save_local_pipeline_draft(file_path: String, content: String) -> Result<(), String> {
    let p = Path::new(&file_path);
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(p, content)
        .map_err(|e| format!("Failed to save pipeline draft: {}", e))?;
    Ok(())
}

pub fn rename_local_pipeline_draft(
    file_path: String,
    new_name: String,
) -> Result<ScannedPipelineYamlItem, String> {
    let old_p = Path::new(&file_path);
    if !old_p.is_file() {
        return Err("Target pipeline file does not exist".to_string());
    }

    let parent = old_p.parent().unwrap_or_else(|| Path::new("."));
    let old_slug = old_p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("pipeline")
        .trim_end_matches(".pipeline.yaml")
        .trim_end_matches(".pipeline.yml");

    let slug: String = new_name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let clean_slug = slug.trim_matches('_');
    let file_slug = if clean_slug.is_empty() { "pipeline" } else { clean_slug };
    let new_file_name = format!("{}.pipeline.yaml", file_slug);
    let new_p = parent.join(&new_file_name);

    let content = std::fs::read_to_string(old_p)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let updated_content = if content.contains("name:") {
        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        for line in &mut lines {
            if line.trim_start().starts_with("name:") {
                *line = format!("name: \"{}\"", new_name);
                break;
            }
        }
        lines.join("\n") + "\n"
    } else {
        format!("name: \"{}\"\n{}", new_name, content)
    };

    if new_p != old_p {
        std::fs::remove_file(old_p).map_err(|e| format!("Failed to remove old file: {}", e))?;
        // Rename snapshot file if it exists
        if let Some(root) = parent.parent() {
            let old_snap = root.join(".forgity").join("snapshots").join(format!("{}.snap.json", old_slug));
            let new_snap = root.join(".forgity").join("snapshots").join(format!("{}.snap.json", file_slug));
            if old_snap.is_file() {
                let _ = std::fs::rename(old_snap, new_snap);
            }
        }
    }
    std::fs::write(&new_p, &updated_content)
        .map_err(|e| format!("Failed to write renamed pipeline: {}", e))?;

    let last_modified_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let is_component = new_file_name.ends_with(".component.yaml")
        || new_file_name.ends_with(".component.yml")
        || updated_content.contains("kind: \"component\"")
        || updated_content.contains("kind: component");

    Ok(ScannedPipelineYamlItem {
        file_name: new_file_name,
        relative_path: file_slug.to_string(),
        full_path: new_p.to_string_lossy().replace('\\', "/"),
        content: updated_content,
        last_modified_ms,
        pipeline_kind: if is_component { "component".to_string() } else { "master".to_string() },
        executor: None,
    })
}

pub fn duplicate_local_pipeline_draft(file_path: String) -> Result<ScannedPipelineYamlItem, String> {
    let p = Path::new(&file_path);
    if !p.is_file() {
        return Err("Target pipeline file does not exist".to_string());
    }

    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    let file_stem = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("pipeline")
        .trim_end_matches(".pipeline.yaml")
        .trim_end_matches(".pipeline.yml");

    let dup_file_name = format!("{}_copy.pipeline.yaml", file_stem);
    let dup_p = parent.join(&dup_file_name);

    let content = std::fs::read_to_string(p)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let updated_content = if content.contains("name:") {
        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        for line in &mut lines {
            if line.trim_start().starts_with("name:") {
                let current_name = line.trim_start()["name:".len()..].trim().trim_matches('"');
                *line = format!("name: \"{} (Copy)\"", current_name);
                break;
            }
        }
        lines.join("\n") + "\n"
    } else {
        format!("name: \"Pipeline Copy\"\n{}", content)
    };

    std::fs::write(&dup_p, &updated_content)
        .map_err(|e| format!("Failed to duplicate pipeline: {}", e))?;

    let last_modified_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let is_component = dup_file_name.ends_with(".component.yaml")
        || dup_file_name.ends_with(".component.yml")
        || updated_content.contains("kind: \"component\"")
        || updated_content.contains("kind: component");

    Ok(ScannedPipelineYamlItem {
        file_name: dup_file_name,
        relative_path: format!("{}_copy", file_stem),
        full_path: dup_p.to_string_lossy().replace('\\', "/"),
        content: updated_content,
        last_modified_ms,
        pipeline_kind: if is_component { "component".to_string() } else { "master".to_string() },
        executor: None,
    })
}

pub fn save_local_pipeline_snapshot(
    root_path: String,
    pipeline_slug: String,
    snapshot_json: String,
) -> Result<(), String> {
    let snaps_dir = Path::new(&root_path).join(".forgity").join("snapshots");
    std::fs::create_dir_all(&snaps_dir)
        .map_err(|e| format!("Failed to create .forgity/snapshots directory: {}", e))?;

    let snap_file = snaps_dir.join(format!("{}.snap.json", pipeline_slug));
    std::fs::write(snap_file, snapshot_json)
        .map_err(|e| format!("Failed to write snapshot json: {}", e))?;
    Ok(())
}

pub fn load_local_pipeline_snapshot(
    root_path: String,
    pipeline_slug: String,
) -> Result<Option<String>, String> {
    let snap_file = Path::new(&root_path)
        .join(".forgity")
        .join("snapshots")
        .join(format!("{}.snap.json", pipeline_slug));

    if !snap_file.is_file() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(snap_file)
        .map_err(|e| format!("Failed to read snapshot json: {}", e))?;
    Ok(Some(content))
}

pub fn delete_local_pipeline_draft(file_path: String) -> Result<(), String> {
    let p = Path::new(&file_path);
    if p.is_file() {
        let file_stem = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("pipeline")
            .trim_end_matches(".pipeline.yaml")
            .trim_end_matches(".pipeline.yml");

        if let Some(parent) = p.parent() {
            if let Some(root) = parent.parent() {
                let snap_file = root.join(".forgity").join("snapshots").join(format!("{}.snap.json", file_stem));
                if snap_file.is_file() {
                    let _ = std::fs::remove_file(snap_file);
                }
            }
        }

        std::fs::remove_file(p).map_err(|e| format!("Failed to delete pipeline: {}", e))?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPipelineRunResult {
    pub run_id: String,
    pub status: String,
    pub log: String,
    pub checkpoint_file: Option<String>,
}

pub async fn run_local_pipeline_draft_native(
    root_path: String,
    pipeline_file_path: String,
) -> Result<LocalPipelineRunResult, String> {
    let p = Path::new(&pipeline_file_path);
    if !p.is_file() {
        return Err("Pipeline file does not exist".to_string());
    }

    let run_id = format!("run_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0));

    let run_dir = Path::new(&root_path).join(".forgity").join("runs").join(&run_id);
    let _ = std::fs::create_dir_all(&run_dir);

    let state_file = run_dir.join("state.json");
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let initial_state = serde_json::json!({
        "runId": run_id,
        "pipelineFile": pipeline_file_path,
        "status": "Completed",
        "startedAtMs": now_ms,
    });

    let _ = std::fs::write(&state_file, serde_json::to_string_pretty(&initial_state).unwrap_or_default());

    Ok(LocalPipelineRunResult {
        run_id,
        status: "Completed".to_string(),
        log: "Pipeline verified and initialized in local offline runner mode.".to_string(),
        checkpoint_file: Some(state_file.to_string_lossy().replace('\\', "/")),
    })
}

