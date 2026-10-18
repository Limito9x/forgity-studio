use anyhow::Result;
use std::time::{Duration, SystemTime};
use tokio::fs::{read_dir, remove_dir_all, remove_file};
use tracing::info;

use super::cache::StorageManager;

#[derive(Debug, Default)]
pub struct CleanReport {
    pub temp_files_deleted: usize,
    pub log_files_deleted: usize,
    pub cache_files_deleted: usize,
    pub bytes_freed: u64,
}

pub struct StorageCleaner {
    storage: StorageManager,
}

impl StorageCleaner {
    pub fn new(storage: StorageManager) -> Self {
        Self { storage }
    }

    /// Cleans temp directories, old log files, and optionally all cached assets/scripts.
    pub async fn clean(&self, clean_all: bool, max_log_age_days: u64) -> Result<CleanReport> {
        let mut report = CleanReport::default();

        // 1. Clean temp directory
        let temp_dir = self.storage.temp_dir();
        if temp_dir.exists() {
            if let Ok(mut entries) = read_dir(&temp_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if let Ok(meta) = entry.metadata().await {
                        report.bytes_freed += meta.len();
                    }
                    if path.is_dir() {
                        if remove_dir_all(&path).await.is_ok() {
                            report.temp_files_deleted += 1;
                        }
                    } else if remove_file(&path).await.is_ok() {
                        report.temp_files_deleted += 1;
                    }
                }
            }
        }

        // 2. Clean old logs
        let logs_dir = self.storage.logs_dir();
        let max_age = Duration::from_secs(max_log_age_days * 24 * 3600);
        let now = SystemTime::now();

        if logs_dir.exists() {
            if let Ok(mut entries) = read_dir(&logs_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if let Ok(meta) = entry.metadata().await {
                        if let Ok(modified) = meta.modified() {
                            if let Ok(age) = now.duration_since(modified) {
                                if age > max_age {
                                    report.bytes_freed += meta.len();
                                    if remove_file(&path).await.is_ok() {
                                        report.log_files_deleted += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Clean cache if clean_all requested
        if clean_all {
            for dir in &[self.storage.assets_dir(), self.storage.scripts_dir()] {
                if dir.exists() {
                    if let Ok(mut entries) = read_dir(dir).await {
                        while let Ok(Some(entry)) = entries.next_entry().await {
                            if let Ok(meta) = entry.metadata().await {
                                report.bytes_freed += meta.len();
                            }
                            if remove_file(entry.path()).await.is_ok() {
                                report.cache_files_deleted += 1;
                            }
                        }
                    }
                }
            }
        }

        info!(
            "Storage clean complete: {} temp items, {} old logs, {} cache files removed ({:.2} MB freed)",
            report.temp_files_deleted,
            report.log_files_deleted,
            report.cache_files_deleted,
            report.bytes_freed as f64 / (1024.0 * 1024.0)
        );

        Ok(report)
    }
}
