use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::fs::{create_dir_all, File, OpenOptions};
use tracing::debug;

pub const STORAGE_LOCK_FILE: &str = ".storage.lock";

/// An RAII guard representing an acquired file lock for the runner storage.
pub struct StorageLockGuard {
    _file: File,
    path: PathBuf,
}

impl StorageLockGuard {
    /// Attempts to acquire an exclusive lock on the storage lockfile.
    pub async fn acquire(base_dir: Option<&Path>) -> Result<Self> {
        let lock_path = match base_dir {
            Some(dir) => dir.join(STORAGE_LOCK_FILE),
            None => PathBuf::from(STORAGE_LOCK_FILE),
        };

        if let Some(parent) = lock_path.parent() {
            create_dir_all(parent).await.ok();
        }

        debug!("Acquiring storage lock at: {:?}", lock_path);

        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)
            .await
            .with_context(|| format!("Failed to open storage lock file at {:?}", lock_path))?;

        Ok(Self {
            _file: file,
            path: lock_path,
        })
    }
}

impl Drop for StorageLockGuard {
    fn drop(&mut self) {
        debug!("Released storage lock at: {:?}", self.path);
    }
}
