use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const RUNNER_STATE_DB_FILE: &str = "runner_state.db";

fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub struct RunnerStateDb {
    conn: Mutex<Connection>,
}

impl RunnerStateDb {
    pub fn open(base_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(base_dir)
            .with_context(|| format!("Failed to create runner base directory {:?}", base_dir))?;

        let db_path = base_dir.join(RUNNER_STATE_DB_FILE);
        let conn = Connection::open(&db_path)
            .with_context(|| format!("Failed to open runner SQLite DB at {:?}", db_path))?;

        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS cached_assets (
                sha256 TEXT PRIMARY KEY,
                extension TEXT,
                file_name TEXT NOT NULL,
                disk_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_accessed_at INTEGER NOT NULL,
                hit_count INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS cached_scripts (
                sha256 TEXT PRIMARY KEY,
                disk_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_accessed_at INTEGER NOT NULL,
                hit_count INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS cached_python_envs (
                env_key TEXT PRIMARY KEY,
                executor TEXT NOT NULL,
                python_runtime TEXT NOT NULL,
                requirements_json TEXT NOT NULL,
                site_packages_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_accessed_at INTEGER NOT NULL
            );
            ",
        )
        .context("Failed to initialize runner_state.db schema")?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn upsert_asset(
        &self,
        sha256: &str,
        extension: Option<&str>,
        file_name: &str,
        disk_path: &Path,
        size_bytes: u64,
    ) -> Result<()> {
        let now = now_unix_secs();
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        conn.execute(
            "
            INSERT INTO cached_assets (sha256, extension, file_name, disk_path, size_bytes, created_at, last_accessed_at, hit_count)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 1)
            ON CONFLICT(sha256) DO UPDATE SET
                extension = COALESCE(excluded.extension, cached_assets.extension),
                file_name = excluded.file_name,
                disk_path = excluded.disk_path,
                size_bytes = excluded.size_bytes,
                last_accessed_at = excluded.last_accessed_at,
                hit_count = cached_assets.hit_count + 1
            ",
            params![
                sha256.to_lowercase(),
                extension,
                file_name,
                disk_path.to_string_lossy().as_ref(),
                size_bytes as i64,
                now
            ],
        )?;
        Ok(())
    }

    pub fn get_and_touch_asset(&self, sha256: &str) -> Result<Option<PathBuf>> {
        let now = now_unix_secs();
        let clean = sha256.to_lowercase();
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        let path_str: Option<String> = conn
            .query_row(
                "SELECT disk_path FROM cached_assets WHERE sha256 = ?1",
                params![clean],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(p) = path_str {
            let path = PathBuf::from(&p);
            if path.is_file() {
                conn.execute(
                    "UPDATE cached_assets SET last_accessed_at = ?1, hit_count = hit_count + 1 WHERE sha256 = ?2",
                    params![now, clean],
                )?;
                return Ok(Some(path));
            } else {
                // Stale DB record where file was deleted externally
                conn.execute("DELETE FROM cached_assets WHERE sha256 = ?1", params![clean])?;
            }
        }
        Ok(None)
    }

    pub fn upsert_script(&self, sha256: &str, disk_path: &Path, size_bytes: u64) -> Result<()> {
        let now = now_unix_secs();
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        conn.execute(
            "
            INSERT INTO cached_scripts (sha256, disk_path, size_bytes, created_at, last_accessed_at, hit_count)
            VALUES (?1, ?2, ?3, ?4, ?4, 1)
            ON CONFLICT(sha256) DO UPDATE SET
                disk_path = excluded.disk_path,
                size_bytes = excluded.size_bytes,
                last_accessed_at = excluded.last_accessed_at,
                hit_count = cached_scripts.hit_count + 1
            ",
            params![
                sha256.to_lowercase(),
                disk_path.to_string_lossy().as_ref(),
                size_bytes as i64,
                now
            ],
        )?;
        Ok(())
    }

    pub fn get_and_touch_script(&self, sha256: &str) -> Result<Option<PathBuf>> {
        let now = now_unix_secs();
        let clean = sha256.to_lowercase();
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        let path_str: Option<String> = conn
            .query_row(
                "SELECT disk_path FROM cached_scripts WHERE sha256 = ?1",
                params![clean],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(p) = path_str {
            let path = PathBuf::from(&p);
            if path.is_file() {
                conn.execute(
                    "UPDATE cached_scripts SET last_accessed_at = ?1, hit_count = hit_count + 1 WHERE sha256 = ?2",
                    params![now, clean],
                )?;
                return Ok(Some(path));
            } else {
                conn.execute("DELETE FROM cached_scripts WHERE sha256 = ?1", params![clean])?;
            }
        }
        Ok(None)
    }

    pub fn upsert_python_env(
        &self,
        env_key: &str,
        executor: &str,
        python_runtime: &str,
        requirements_json: &str,
        site_packages_path: &Path,
        size_bytes: u64,
    ) -> Result<()> {
        let now = now_unix_secs();
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        conn.execute(
            "
            INSERT INTO cached_python_envs (env_key, executor, python_runtime, requirements_json, site_packages_path, size_bytes, created_at, last_accessed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            ON CONFLICT(env_key) DO UPDATE SET
                executor = excluded.executor,
                python_runtime = excluded.python_runtime,
                requirements_json = excluded.requirements_json,
                site_packages_path = excluded.site_packages_path,
                size_bytes = excluded.size_bytes,
                last_accessed_at = excluded.last_accessed_at
            ",
            params![
                env_key,
                executor,
                python_runtime,
                requirements_json,
                site_packages_path.to_string_lossy().as_ref(),
                size_bytes as i64,
                now
            ],
        )?;
        Ok(())
    }

    pub fn touch_python_env(&self, env_key: &str) -> Result<()> {
        let now = now_unix_secs();
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        conn.execute(
            "UPDATE cached_python_envs SET last_accessed_at = ?1 WHERE env_key = ?2",
            params![now, env_key],
        )?;
        Ok(())
    }

    pub fn delete_python_env(&self, env_key: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        conn.execute("DELETE FROM cached_python_envs WHERE env_key = ?1", params![env_key])?;
        Ok(())
    }

    pub fn clear_all_cache_records(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow::anyhow!("DB mutex poisoned"))?;
        conn.execute_batch(
            "
            DELETE FROM cached_assets;
            DELETE FROM cached_scripts;
            DELETE FROM cached_python_envs;
            ",
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_runner_state_db_asset_and_script_lifecycle() {
        let temp_root = std::env::temp_dir().join(format!("forgity_db_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_root).unwrap();

        let db = RunnerStateDb::open(&temp_root).unwrap();
        let asset_file = temp_root.join("abc123.png");
        std::fs::write(&asset_file, b"fake_png_bytes").unwrap();

        db.upsert_asset("abc123", Some("png"), "abc123.png", &asset_file, 14)
            .unwrap();
        let found = db.get_and_touch_asset("ABC123").unwrap();
        assert_eq!(found, Some(asset_file.clone()));

        // Delete file externally -> get_and_touch_asset should clean stale record and return None
        std::fs::remove_file(&asset_file).unwrap();
        assert_eq!(db.get_and_touch_asset("abc123").unwrap(), None);

        let _ = std::fs::remove_dir_all(&temp_root);
    }
}

