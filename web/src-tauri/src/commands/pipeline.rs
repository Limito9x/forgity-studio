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
            let is_pipeline_yaml = file_name.ends_with(".pipeline.yaml") || file_name.ends_with(".pipeline.yml");
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

            results.push(ScannedPipelineYamlItem {
                file_name,
                relative_path: relative,
                full_path: path.to_string_lossy().replace('\\', "/"),
                content,
                last_modified_ms,
            });
        }
    }
}

#[tauri::command]
pub fn scan_local_pipeline_drafts(folder_path: String) -> Vec<ScannedPipelineYamlItem> {
    let mut results = Vec::new();
    let root = Path::new(&folder_path);
    if root.is_dir() {
        scan_yaml_recursive(root, root, &mut results);
    }
    results
}

#[tauri::command]
pub fn create_local_pipeline_draft(
    pipelines_dir_path: String,
    name: String,
) -> Result<ScannedPipelineYamlItem, String> {
    let dir = Path::new(&pipelines_dir_path);
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create pipelines directory: {}", e))?;

    let slug: String = name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let clean_slug = slug.trim_matches('_');
    let file_slug = if clean_slug.is_empty() { "pipeline" } else { clean_slug };
    let file_name = format!("{}.pipeline.yaml", file_slug);
    let full_path = dir.join(&file_name);

    let default_yaml = format!(
        "name: \"{}\"\nversion: \"draft\"\nrunner: \"local\"\nnodes:\n  - id: start\n    tool: Start\n    label: \"Start Pipeline\"\n  - id: return\n    tool: Return\n    label: \"Return\"\nedges: []\n",
        name
    );

    std::fs::write(&full_path, &default_yaml)
        .map_err(|e| format!("Failed to write draft pipeline: {}", e))?;

    // Also remove any stale snapshot from earlier deleted pipelines with the same slug
    if let Some(parent) = dir.parent() {
        let snap_file = parent.join(".forgity").join("snapshots").join(format!("{}.snap.json", file_slug));
        if snap_file.is_file() {
            let _ = std::fs::remove_file(snap_file);
        }
    }

    let last_modified_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(ScannedPipelineYamlItem {
        file_name,
        relative_path: file_slug.to_string(),
        full_path: full_path.to_string_lossy().replace('\\', "/"),
        content: default_yaml,
        last_modified_ms,
    })
}

#[tauri::command]
pub fn save_local_pipeline_draft(file_path: String, content: String) -> Result<(), String> {
    let p = Path::new(&file_path);
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(p, content)
        .map_err(|e| format!("Failed to save pipeline draft: {}", e))?;
    Ok(())
}

#[tauri::command]
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

    Ok(ScannedPipelineYamlItem {
        file_name: new_file_name,
        relative_path: file_slug.to_string(),
        full_path: new_p.to_string_lossy().replace('\\', "/"),
        content: updated_content,
        last_modified_ms,
    })
}

#[tauri::command]
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

    Ok(ScannedPipelineYamlItem {
        file_name: dup_file_name,
        relative_path: format!("{}_copy", file_stem),
        full_path: dup_p.to_string_lossy().replace('\\', "/"),
        content: updated_content,
        last_modified_ms,
    })
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

