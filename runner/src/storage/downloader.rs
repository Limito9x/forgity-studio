use anyhow::{Context, Result};
use futures_lite::StreamExt;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::fs::{create_dir_all, remove_file, File};
use tokio::io::AsyncWriteExt;
use tracing::{debug, error, info};
use uuid::Uuid;

use super::cache::StorageManager;

pub struct StreamDownloader {
    client: reqwest::Client,
    storage: StorageManager,
}

impl StreamDownloader {
    pub fn new(storage: StorageManager) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3600)) // 1 hour for big 3D files
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { client, storage }
    }

    /// Downloads a file from an S3 Presigned or HTTP URL via chunked zero-RAM streaming,
    /// simultaneously calculating SHA-256 hash in a single pass.
    ///
    /// If `expected_hash` is provided and verification fails, the temporary download is purged.
    /// On success, the file is committed into `cache/assets/{hash}.{ext}`.
    pub async fn download_asset(
        &self,
        url: &str,
        expected_hash: Option<&str>,
        extension: Option<&str>,
    ) -> Result<(PathBuf, String)> {
        // 1. Check if asset is already cached by expected_hash
        if let Some(hash) = expected_hash {
            if let Ok(Some(cached_path)) = self.storage.find_cached_asset(hash).await {
                info!("Asset cache hit for SHA-256 [{}]: {:?}", hash, cached_path);
                return Ok((cached_path, hash.to_lowercase()));
            }
        }

        self.storage.init_directories().await?;

        // 2. Prepare temporary .part file
        let download_id = Uuid::new_v4();
        let temp_dir = self.storage.temp_dir();
        create_dir_all(&temp_dir).await.ok();
        let temp_part_path = temp_dir.join(format!("download_{}.part", download_id));

        info!(
            "Starting zero-RAM piped download from URL: {} (streaming to {:?})",
            url, temp_part_path
        );

        let response = self
            .client
            .get(url)
            .send()
            .await
            .with_context(|| format!("Failed to initiate download from {}", url))?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Download failed with HTTP status: {}",
                response.status()
            ));
        }

        let total_size = response.content_length();
        if let Some(size) = total_size {
            debug!("Content-Length: {} bytes ({:.2} MB)", size, size as f64 / (1024.0 * 1024.0));
        }

        let mut file = File::create(&temp_part_path)
            .await
            .with_context(|| format!("Failed to create part file at {:?}", temp_part_path))?;

        let mut hasher = Sha256::new();
        let mut downloaded_bytes: u64 = 0;
        let mut stream = response.bytes_stream();

        // 3. Piped streaming: read chunk -> write to disk -> update hasher
        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.with_context(|| "Error while reading network stream chunk")?;
            file.write_all(&chunk).await?;
            hasher.update(&chunk);
            downloaded_bytes += chunk.len() as u64;
        }

        file.flush().await?;
        drop(file);

        let actual_hash = hex::encode(hasher.finalize());
        info!(
            "Download finished ({} bytes). Computed SHA-256: {}",
            downloaded_bytes, actual_hash
        );

        // 4. Verify checksum if requested
        if let Some(expected) = expected_hash {
            if !actual_hash.eq_ignore_ascii_case(expected) {
                error!(
                    "SHA-256 Checksum mismatch! Expected: {}, Actual: {}. Deleting corrupted part file.",
                    expected, actual_hash
                );
                let _ = remove_file(&temp_part_path).await;
                return Err(anyhow::anyhow!(
                    "SHA-256 mismatch for downloaded file: expected {}, got {}",
                    expected,
                    actual_hash
                ));
            }
        }

        // 5. Commit to CAS cache
        let committed_path = self
            .storage
            .commit_asset(&temp_part_path, &actual_hash, extension)
            .await?;

        Ok((committed_path, actual_hash))
    }
}
