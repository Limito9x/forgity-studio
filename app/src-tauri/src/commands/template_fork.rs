use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateAssetToStage {
    pub file_name: String,
    pub relative_path: Option<String>,
    pub sha256: Option<String>,
    pub data_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePipelineFileToStage {
    pub file_name: String,
    pub relative_path: String,
    pub pipeline_kind: String,
    pub yaml_content: String,
    pub snapshot_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkTemplateParams {
    pub target_root_path: String,
    pub workspace_name: String,
    pub template_id: String,
    pub version_id: String,
    pub template_title: String,
    pub pipelines: Vec<TemplatePipelineFileToStage>,
    pub palette_json: Option<String>,
    pub structs_json: Option<String>,
    pub constants_json: Option<String>,
    pub assets: Vec<TemplateAssetToStage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkTemplateResult {
    pub workspace_id: String,
    pub root_path: String,
    pub staged_pipelines: usize,
    pub staged_assets: usize,
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub fn fork_template_into_local_workspace(
    app_data_dir: &Path,
    params: ForkTemplateParams,
) -> Result<ForkTemplateResult, String> {
    let root = Path::new(&params.target_root_path);
    if !root.exists() {
        std::fs::create_dir_all(root)
            .map_err(|e| format!("Failed to create workspace target directory: {}", e))?;
    }

    // 1. Initialize workspace root and .forgity/workspace.db
    let db = forgity_core::workspace_db::WorkspaceDb::open(root)?;
    let pipelines_dir = root.join("pipelines");
    let assets_dir = root.join("assets");
    let scripts_dir = root.join("pipeline-scripts");

    std::fs::create_dir_all(&pipelines_dir)
        .map_err(|e| format!("Failed to create pipelines dir: {}", e))?;
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;
    std::fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("Failed to create pipeline-scripts dir: {}", e))?;

    // 2. Stage palette, structs, constants if provided
    if let Some(ref pal) = params.palette_json {
        let _ = db.save_palette_json(pal);
    }
    if let Some(ref structs) = params.structs_json {
        let _ = db.save_structs_json(structs);
    }
    if let Some(ref consts) = params.constants_json {
        let _ = db.save_constants_json(consts);
    }

    // 3. Stage pipelines into pipelines/ and index into local_pipelines
    let mut staged_pipelines_count = 0;
    for pipe in &params.pipelines {
        let file_path = pipelines_dir.join(&pipe.file_name);
        std::fs::write(&file_path, &pipe.yaml_content)
            .map_err(|e| format!("Failed to write pipeline file '{}': {}", pipe.file_name, e))?;

        let slug = pipe.file_name
            .trim_end_matches(".pipeline.yaml")
            .trim_end_matches(".component.yaml")
            .to_string();

        if let Some(ref snap) = pipe.snapshot_json {
            let _ = db.save_pipeline_entry_with_snapshot(
                &slug,
                &pipe.file_name,
                &pipe.relative_path,
                &pipe.pipeline_kind,
                snap,
            );
        }

        staged_pipelines_count += 1;
    }

    // 4. Stage Assets into assets/ and verify SHA-256
    let mut staged_assets_count = 0;
    for asset in &params.assets {
        if let Some(ref b64) = asset.data_base64 {
            // Standard base64 decoding (without external crate dependency)
            // Or if small raw string:
            let decoded = match parse_base64_or_raw(b64) {
                Ok(bytes) => bytes,
                Err(err) => return Err(format!("Asset '{}' base64 decode failed: {}", asset.file_name, err)),
            };

            if let Some(ref expected_hash) = asset.sha256 {
                let actual_hash = sha256_bytes(&decoded);
                if !expected_hash.is_empty() && actual_hash.to_lowercase() != expected_hash.to_lowercase() {
                    return Err(format!(
                        "Asset '{}' SHA-256 mismatch! Expected: {}, got: {}",
                        asset.file_name, expected_hash, actual_hash
                    ));
                }
            }

            let asset_path = assets_dir.join(&asset.file_name);
            std::fs::write(&asset_path, &decoded)
                .map_err(|e| format!("Failed to write staged asset '{}': {}", asset.file_name, e))?;
            staged_assets_count += 1;
        }
    }

    // 5. Register in Workspace Registry (AppData)
    let registry = forgity_core::workspace_registry::WorkspaceRegistryDb::open(app_data_dir)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());

    let workspace_id = format!("ws_fork_{}", &now);
    let ws = forgity_core::workspace_registry::RegisteredWorkspace {
        id: workspace_id.clone(),
        name: params.workspace_name,
        root_path: params.target_root_path.clone(),
        linked_project_id: None,
        origin_template_id: Some(params.template_id),
        origin_version_id: Some(params.version_id),
        origin_template_title: Some(params.template_title),
        last_opened_at: now.clone(),
        created_at: now,
    };

    registry.upsert_workspace(&ws)?;

    Ok(ForkTemplateResult {
        workspace_id,
        root_path: params.target_root_path,
        staged_pipelines: staged_pipelines_count,
        staged_assets: staged_assets_count,
    })
}

#[tauri::command]
pub fn fork_template_workspace(
    app: tauri::AppHandle,
    params: ForkTemplateParams,
) -> Result<ForkTemplateResult, String> {
    use tauri::Manager;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app_data_dir: {}", e))?;
    fork_template_into_local_workspace(&app_data_dir, params)
}

fn parse_base64_or_raw(input: &str) -> Result<Vec<u8>, String> {
    // If input contains data URI scheme e.g. "data:...;base64,"
    let raw = if let Some(idx) = input.find(";base64,") {
        &input[idx + 8..]
    } else {
        input.trim()
    };

    // Standard base64 decoding helper
    decode_b64(raw)
}

fn decode_b64(s: &str) -> Result<Vec<u8>, String> {
    const B64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [0xFFu8; 256];
    for (i, &b) in B64_TABLE.iter().enumerate() {
        table[b as usize] = i as u8;
    }

    let clean: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace() && *b != b'=').collect();
    let mut out = Vec::with_capacity((clean.len() * 3) / 4);

    let chunks = clean.chunks_exact(4);
    let rem = chunks.remainder();

    for chunk in chunks {
        let b0 = table[chunk[0] as usize];
        let b1 = table[chunk[1] as usize];
        let b2 = table[chunk[2] as usize];
        let b3 = table[chunk[3] as usize];

        if b0 == 0xFF || b1 == 0xFF || b2 == 0xFF || b3 == 0xFF {
            return Err("Invalid base64 character".to_string());
        }

        out.push((b0 << 2) | (b1 >> 4));
        out.push((b1 << 4) | (b2 >> 2));
        out.push((b2 << 6) | b3);
    }

    if rem.len() == 2 {
        let b0 = table[rem[0] as usize];
        let b1 = table[rem[1] as usize];
        if b0 == 0xFF || b1 == 0xFF {
            return Err("Invalid base64 character".to_string());
        }
        out.push((b0 << 2) | (b1 >> 4));
    } else if rem.len() == 3 {
        let b0 = table[rem[0] as usize];
        let b1 = table[rem[1] as usize];
        let b2 = table[rem[2] as usize];
        if b0 == 0xFF || b1 == 0xFF || b2 == 0xFF {
            return Err("Invalid base64 character".to_string());
        }
        out.push((b0 << 2) | (b1 >> 4));
        out.push((b1 << 4) | (b2 >> 2));
    }

    Ok(out)
}
