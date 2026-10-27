use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::fs::{create_dir_all, read_dir, write};
use tracing::{debug, info};

/// Strips Windows verbatim prefix (`\\?\`) so that subprocesses and Python standard library
/// receive standard clean paths.
pub fn normalize_absolute_path(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if s.starts_with(r"\\?\") {
        PathBuf::from(&s[4..])
    } else {
        path
    }
}

pub struct StorageManager {
    base_dir: PathBuf,
}

impl StorageManager {
    pub fn new(base_dir: Option<PathBuf>) -> Self {
        let raw = base_dir.unwrap_or_else(|| {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        });
        let abs = std::fs::canonicalize(&raw).unwrap_or(raw);
        Self {
            base_dir: normalize_absolute_path(abs),
        }
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.base_dir.join("cache")
    }

    pub fn assets_dir(&self) -> PathBuf {
        self.cache_dir().join("assets")
    }

    pub fn scripts_dir(&self) -> PathBuf {
        self.cache_dir().join("scripts")
    }

    pub fn python_packages_dir(&self) -> PathBuf {
        self.cache_dir().join("python-packages")
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
        create_dir_all(self.python_packages_dir()).await?;
        create_dir_all(self.temp_dir()).await?;
        create_dir_all(self.logs_dir()).await?;
        debug!("Initialized runtime storage directories at {:?}", self.base_dir);
        Ok(())
    }

    /// Finds a cached asset by its SHA-256 hash prefix or exact match, returning an absolute path.
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
                let p = entry.path();
                let abs = std::fs::canonicalize(&p).unwrap_or(p);
                return Ok(Some(normalize_absolute_path(abs)));
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
            let abs = std::fs::canonicalize(&candidate).unwrap_or(candidate);
            return Ok(Some(normalize_absolute_path(abs)));
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

        let abs = std::fs::canonicalize(&target_path).unwrap_or(target_path);
        let norm = normalize_absolute_path(abs);
        info!("Saved script to cache: {:?}", norm);
        Ok(norm)
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

        let abs = std::fs::canonicalize(&target_path).unwrap_or(target_path);
        let norm = normalize_absolute_path(abs);
        info!("Committed asset to CAS cache: {:?}", norm);
        Ok(norm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_verbatim_path() {
        let p = PathBuf::from(r"\\?\D:\Games\Projects\Test.py");
        let norm = normalize_absolute_path(p);
        assert_eq!(norm, PathBuf::from(r"D:\Games\Projects\Test.py"));
    }

    #[test]
    fn test_normalize_normal_path() {
        let p = PathBuf::from(r"D:\Games\Projects\Test.py");
        let norm = normalize_absolute_path(p);
        assert_eq!(norm, PathBuf::from(r"D:\Games\Projects\Test.py"));
    }

    #[test]
    fn test_storage_manager_paths_are_absolute() {
        let storage = StorageManager::new(None);
        assert!(storage.base_dir().is_absolute(), "base_dir should be absolute");
        assert!(storage.assets_dir().is_absolute(), "assets_dir should be absolute");
        assert!(storage.scripts_dir().is_absolute(), "scripts_dir should be absolute");
        assert!(storage.temp_dir().is_absolute(), "temp_dir should be absolute");
        assert!(storage.logs_dir().is_absolute(), "logs_dir should be absolute");

        // Ensure no \\?\ verbatim prefix
        let base_str = storage.base_dir().to_string_lossy();
        assert!(!base_str.starts_with(r"\\?\"), "base_dir must not have \\?\\ prefix");
    }
}
