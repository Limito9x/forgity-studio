use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::fs::{create_dir_all, read_dir, write};
use tracing::{debug, info};

pub struct StorageManager {
    base_dir: PathBuf,
}

impl StorageManager {
    pub fn new(base_dir: Option<PathBuf>) -> Self {
        Self {
            base_dir: base_dir.unwrap_or_else(|| PathBuf::from(".")),
        }
    }

    pub fn assets_dir(&self) -> PathBuf {
        self.base_dir.join("cache").join("assets")
    }

    pub fn scripts_dir(&self) -> PathBuf {
        self.base_dir.join("cache").join("scripts")
    }

    pub fn temp_dir(&self) -> PathBuf {
        self.base_dir.join("temp")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.base_dir.join("logs")
    }

    /// Initializes all required runtime storage directories.
    pub async fn init_directories(&self) -> Result<()> {
        create_dir_all(self.assets_dir()).await?;
        create_dir_all(self.scripts_dir()).await?;
        create_dir_all(self.temp_dir()).await?;
        create_dir_all(self.logs_dir()).await?;
        debug!("Initialized runtime storage directories");
        Ok(())
    }

    /// Finds a cached asset by its SHA-256 hash prefix or exact match.
    pub async fn find_cached_asset(&self, sha256_hash: &str) -> Result<Option<PathBuf>> {
        let assets_dir = self.assets_dir();
        if !assets_dir.exists() {
            return Ok(None);
        }

        let clean_hash = sha256_hash.to_lowercase();
        let mut entries = read_dir(&assets_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let file_name = entry.file_name().to_string_lossy().to_lowercase();
            // Check if file starts with the hash or stem equals hash
            if file_name.starts_with(&clean_hash) {
                return Ok(Some(entry.path()));
            }
        }

        Ok(None)
    }

    /// Finds a cached script by its SHA-256 hash.
    pub async fn find_cached_script(&self, sha256_hash: &str) -> Result<Option<PathBuf>> {
        let scripts_dir = self.scripts_dir();
        if !scripts_dir.exists() {
            return Ok(None);
        }

        let clean_hash = sha256_hash.to_lowercase();
        let candidate = scripts_dir.join(format!("{}.py", clean_hash));
        if candidate.is_file() {
            return Ok(Some(candidate));
        }

        Ok(None)
    }

    /// Stores a script in `cache/scripts/{sha256}.py`.
    pub async fn save_script(&self, content: &str, sha256_hash: &str) -> Result<PathBuf> {
        self.init_directories().await?;
        let clean_hash = sha256_hash.to_lowercase();
        let target_path = self.scripts_dir().join(format!("{}.py", clean_hash));

        write(&target_path, content.as_bytes())
            .await
            .with_context(|| format!("Failed to write script to {:?}", target_path))?;

        info!("Saved script to cache: {:?}", target_path);
        Ok(target_path)
    }

    /// Commits a downloaded asset from temporary file to `cache/assets/{sha256}.{ext}`.
    pub async fn commit_asset(
        &self,
        temp_file: &Path,
        sha256_hash: &str,
        extension: Option<&str>,
    ) -> Result<PathBuf> {
        self.init_directories().await?;
        let clean_hash = sha256_hash.to_lowercase();

        let file_name = match extension {
            Some(ext) => {
                let clean_ext = ext.trim_start_matches('.');
                format!("{}.{}", clean_hash, clean_ext)
            }
            None => clean_hash,
        };

        let target_path = self.assets_dir().join(file_name);

        tokio::fs::rename(temp_file, &target_path)
            .await
            .with_context(|| format!("Failed to commit asset from {:?} to {:?}", temp_file, target_path))?;

        info!("Committed asset to CAS cache: {:?}", target_path);
        Ok(target_path)
    }
}
