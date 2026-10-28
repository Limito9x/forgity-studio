use anyhow::Result;
use std::path::Path;
use std::time::{Duration, SystemTime};
use tokio::fs::{read_dir, remove_dir_all, remove_file};
use tracing::info;

use super::cache::StorageManager;

#[derive(Debug, Default)]
pub struct CleanReport {
    pub temp_files_deleted: usize,
    pub log_files_deleted: usize,
    pub cache_files_deleted: usize,
    pub python_packages_deleted: usize,
    pub bytes_freed: u64,
}

pub struct StorageCleaner {
    storage: StorageManager,
}

impl StorageCleaner {
    pub fn new(storage: StorageManager) -> Self {
        Self { storage }
    }

    /// Recursively calculates disk size and item count of a path
    fn get_path_size_recursive(path: &Path) -> (u64, usize) {
        let mut total_bytes = 0;
        let mut count = 0;
        if let Ok(metadata) = std::fs::symlink_metadata(path) {
            if metadata.is_dir() {
                if let Ok(entries) = std::fs::read_dir(path) {
                    for entry in entries.flatten() {
                        let (b, c) = Self::get_path_size_recursive(&entry.path());
                        total_bytes += b;
                        count += c;
                    }
                }
            } else {
                total_bytes += metadata.len();
                count += 1;
            }
        }
        (total_bytes, count)
    }

    /// Cleans temp directories, old log files, and cached assets/scripts/python packages.
    pub async fn clean(&self, clean_all: bool, max_log_age_days: u64) -> Result<CleanReport> {
        let mut report = CleanReport::default();
        let max_age = Duration::from_secs(max_log_age_days * 24 * 3600);
        let now = SystemTime::now();

        // 1. Clean temp directory (all subdirectories & files)
        let temp_dir = self.storage.temp_dir();
        if temp_dir.exists() {
            if let Ok(mut entries) = read_dir(&temp_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    let (bytes, count) = Self::get_path_size_recursive(&path);
                    if path.is_dir() {
                        if remove_dir_all(&path).await.is_ok() {
                            report.temp_files_deleted += count.max(1);
                            report.bytes_freed += bytes;
                        }
                    } else if remove_file(&path).await.is_ok() {
                        report.temp_files_deleted += 1;
                        report.bytes_freed += bytes;
                    }
                }
            }
        }

        // 2. Clean old logs
        let logs_dir = self.storage.logs_dir();
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

        // 3. Dynamic Cache Scanning & Intelligent Policy Cleanup
        let cache_dir = self.storage.cache_dir();
        if cache_dir.exists() {
            if let Ok(mut cache_entries) = read_dir(&cache_dir).await {
                while let Ok(Some(category_entry)) = cache_entries.next_entry().await {
                    let category_path = category_entry.path();
                    if !category_path.is_dir() {
                        continue;
                    }

                    let folder_name = category_entry.file_name().to_string_lossy().to_string();

                    match folder_name.as_str() {
                        "python-packages" => {
                            // Python packages can be pruned by age (in maintenance) or wiped on clean_all
                            if let Ok(mut pkg_entries) = read_dir(&category_path).await {
                                while let Ok(Some(pkg_entry)) = pkg_entries.next_entry().await {
                                    let pkg_path = pkg_entry.path();
                                    let mut should_delete = clean_all;

                                    if !clean_all {
                                        // Maintenance mode: check if package directory modified/accessed > max_age
                                        if let Ok(meta) = pkg_entry.metadata().await {
                                            if let Ok(modified) = meta.modified() {
                                                if let Ok(age) = now.duration_since(modified) {
                                                    if age > max_age {
                                                        should_delete = true;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    if should_delete {
                                        let (bytes, count) = Self::get_path_size_recursive(&pkg_path);
                                        if pkg_path.is_dir() {
                                            if remove_dir_all(&pkg_path).await.is_ok() {
                                                report.python_packages_deleted += 1;
                                                report.cache_files_deleted += count;
                                                report.bytes_freed += bytes;
                                            }
                                        } else if remove_file(&pkg_path).await.is_ok() {
                                            report.cache_files_deleted += 1;
                                            report.bytes_freed += bytes;
                                        }
                                    }
                                }
                            }
                        }
                        _ => {
                            // Default cache categories (assets, scripts, or any dynamically added cache)
                            if clean_all {
                                if let Ok(mut sub_entries) = read_dir(&category_path).await {
                                    while let Ok(Some(sub_entry)) = sub_entries.next_entry().await {
                                        let sub_path = sub_entry.path();
                                        let (bytes, count) = Self::get_path_size_recursive(&sub_path);
                                        if sub_path.is_dir() {
                                            if remove_dir_all(&sub_path).await.is_ok() {
                                                report.cache_files_deleted += count.max(1);
                                                report.bytes_freed += bytes;
                                            }
                                        } else if remove_file(&sub_path).await.is_ok() {
                                            report.cache_files_deleted += 1;
                                            report.bytes_freed += bytes;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        info!(
            "Storage clean complete: {} temp items, {} old logs, {} cache items, {} python packages ({:.2} MB freed)",
            report.temp_files_deleted,
            report.log_files_deleted,
            report.cache_files_deleted,
            report.python_packages_deleted,
            report.bytes_freed as f64 / (1024.0 * 1024.0)
        );

        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs::{create_dir_all, remove_dir_all, write};

    #[tokio::test]
    async fn test_cleaner_dynamic_cache_discovery_and_purge() -> Result<()> {
        let test_dir = std::env::temp_dir().join(format!("forgity_cleaner_test_{}", uuid::Uuid::new_v4()));
        let storage = StorageManager::new(Some(test_dir.clone()));
        storage.init_directories().await?;

        // 1. Create a dummy temp folder and file
        let temp_stage = storage.temp_dir().join("stage_test_123");
        create_dir_all(&temp_stage).await?;
        write(temp_stage.join("task.json"), b"{\"steps\":[]}").await?;

        // 2. Create assets cache with a subfolder (__pycache__)
        let pycache = storage.assets_dir().join("__pycache__");
        create_dir_all(&pycache).await?;
        write(pycache.join("dummy.pyc"), b"binary").await?;

        // 3. Create python-packages cache folder
        let pkg_dir = storage.python_packages_dir().join("hash_numpy_123");
        create_dir_all(&pkg_dir).await?;
        write(pkg_dir.join("numpy.py"), b"print('numpy')").await?;

        let cleaner = StorageCleaner::new(storage);

        // Run full purge
        let report = cleaner.clean(true, 7).await?;

        assert!(report.temp_files_deleted >= 1);
        assert!(report.python_packages_deleted >= 1);
        assert!(report.cache_files_deleted >= 1);
        assert!(report.bytes_freed > 0);

        // Verify temp stage was removed
        assert!(!temp_stage.exists());
        // Verify python package was removed
        assert!(!pkg_dir.exists());

        // Cleanup test directory
        let _ = remove_dir_all(&test_dir).await;

        Ok(())
    }
}
