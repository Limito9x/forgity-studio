use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

/// Computes the SHA-256 hexadecimal hash string for a file on disk using streaming buffer.
pub async fn compute_file_sha256(path: &Path) -> Result<String> {
    let mut file = File::open(path)
        .await
        .with_context(|| format!("Failed to open file for SHA-256 computation: {:?}", path))?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024]; // 64 KB buffer

    loop {
        let bytes_read = file.read(&mut buffer).await?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    let result = hasher.finalize();
    Ok(hex::encode(result))
}

/// Verifies whether a file's SHA-256 checksum matches the expected hash (case-insensitive).
pub async fn verify_file_sha256(path: &Path, expected_hash: &str) -> Result<bool> {
    let actual_hash = compute_file_sha256(path).await?;
    Ok(actual_hash.eq_ignore_ascii_case(expected_hash))
}
