use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::script_contracts::{load_contracts_file, save_contracts_file};

pub const WORKSPACE_DB_FILE: &str = "workspace.db";

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

pub struct WorkspaceDb {
    conn: Connection,
}

/// One persisted dependency edge of `local_dependencies`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalDependencyRow {
    pub parent_kind: String,
    pub parent_key: String,
    pub dep_kind: String,
    pub dep_key: String,
}

impl WorkspaceDb {
    pub fn open(root_path: &Path) -> Result<Self, String> {
        let forgity_dir = root_path.join(".forgity");
        std::fs::create_dir_all(&forgity_dir)
            .map_err(|e| format!("Failed to create .forgity directory: {}", e))?;

        let db_path: PathBuf = forgity_dir.join(WORKSPACE_DB_FILE);
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open workspace.db: {}", e))?;

        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS local_constants (
                key TEXT PRIMARY KEY,
                id TEXT NOT NULL,
                value_json TEXT NOT NULL,
                data_type TEXT NOT NULL,
                scope TEXT NOT NULL,
                unreal_path TEXT,
                description TEXT,
                content_hash TEXT NOT NULL,
                remote_id TEXT,
                published_hash TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS local_structs (
                slug TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                description TEXT,
                fields_json TEXT NOT NULL,
                source_kind TEXT NOT NULL DEFAULT 'declarative',
                content_hash TEXT NOT NULL,
                remote_id TEXT,
                published_hash TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS local_scripts (
                key TEXT PRIMARY KEY,
                raw_json TEXT NOT NULL,
                executor TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                remote_id TEXT,
                published_hash TEXT,
                last_synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS local_pipelines (
                slug TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                full_path TEXT NOT NULL,
                pipeline_kind TEXT NOT NULL,
                executor TEXT,
                content_hash TEXT NOT NULL,
                last_modified_ms INTEGER NOT NULL,
                remote_id TEXT,
                published_hash TEXT,
                snapshot_json TEXT
            );

            CREATE TABLE IF NOT EXISTS local_dependencies (
                parent_kind TEXT NOT NULL,
                parent_key TEXT NOT NULL,
                dep_kind TEXT NOT NULL,
                dep_key TEXT NOT NULL,
                PRIMARY KEY (parent_kind, parent_key, dep_kind, dep_key)
            );
            ",
        )
        .map_err(|e| format!("Failed to initialize workspace.db schema: {}", e))?;

        // Auto-migrate schema: ensure local_pipelines has snapshot_json column
        let _ = conn.execute("ALTER TABLE local_pipelines ADD COLUMN snapshot_json TEXT", []);

        Ok(Self { conn })
    }

    pub fn migrate_legacy_json_if_needed(&self, root_path: &Path) -> Result<(), String> {
        let forgity_dir = root_path.join(".forgity");
        let mut contracts = load_contracts_file(root_path);
        let mut contracts_dirty = false;

        // 1. Migrate local_palette.json -> local_scripts
        let palette_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM local_scripts", [], |r| r.get(0))
            .unwrap_or(0);
        let legacy_palette = forgity_dir.join("local_palette.json");
        if palette_count == 0 && legacy_palette.is_file() {
            if let Ok(content) = std::fs::read_to_string(&legacy_palette) {
                if !content.trim().is_empty() && content.trim() != "{}" {
                    let _ = self.save_palette_json(&content);
                }
            }
            let _ = std::fs::rename(&legacy_palette, forgity_dir.join("local_palette.json.bak"));
        }

        // 2. Migrate local_structs.json -> local_structs + contracts.yaml
        let structs_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM local_structs", [], |r| r.get(0))
            .unwrap_or(0);
        let legacy_structs = forgity_dir.join("local_structs.json");
        if structs_count == 0 && legacy_structs.is_file() {
            if let Ok(content) = std::fs::read_to_string(&legacy_structs) {
                if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                    if !arr.is_empty() {
                        let _ = self.save_structs_json(&content);
                        if contracts.structs.is_empty() {
                            contracts.structs = arr;
                            contracts_dirty = true;
                        }
                    }
                }
            }
            let _ = std::fs::rename(&legacy_structs, forgity_dir.join("local_structs.json.bak"));
        }

        // 3. Migrate constants.json -> local_constants + contracts.yaml
        let constants_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM local_constants", [], |r| r.get(0))
            .unwrap_or(0);
        let legacy_constants = forgity_dir.join("constants.json");
        if constants_count == 0 && legacy_constants.is_file() {
            if let Ok(content) = std::fs::read_to_string(&legacy_constants) {
                if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                    if !arr.is_empty() {
                        let _ = self.save_constants_json(&content);
                        if contracts.constants.is_empty() {
                            contracts.constants = arr;
                            contracts_dirty = true;
                        }
                    }
                }
            }
            let _ = std::fs::rename(&legacy_constants, forgity_dir.join("constants.json.bak"));
        }

        // 4. Migrate legacy .forgity/snapshots/*.snap.json -> local_pipelines.snapshot_json
        let legacy_snaps_dir = forgity_dir.join("snapshots");
        if legacy_snaps_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&legacy_snaps_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let fname = entry.file_name().to_string_lossy().to_string();
                        if fname.ends_with(".snap.json") {
                            let slug = fname.trim_end_matches(".snap.json");
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                if !content.trim().is_empty() {
                                    let _ = self.save_pipeline_snapshot(slug, &content);
                                }
                            }
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
            // If empty, clean up snapshots folder
            let _ = std::fs::remove_dir(&legacy_snaps_dir);
        }

        if contracts_dirty {
            let _ = save_contracts_file(root_path, &contracts);
        }

        Ok(())
    }

    pub fn load_palette_json(&self) -> Result<String, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, raw_json FROM local_scripts ORDER BY key ASC")
            .map_err(|e| format!("Failed to prepare palette query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let key: String = row.get(0)?;
                let raw_json: String = row.get(1)?;
                Ok((key, raw_json))
            })
            .map_err(|e| format!("Failed to query local_scripts: {}", e))?;

        let mut map = serde_json::Map::new();
        for row in rows.flatten() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&row.1) {
                map.insert(row.0, val);
            }
        }

        serde_json::to_string(&serde_json::Value::Object(map))
            .map_err(|e| format!("Failed to serialize palette JSON: {}", e))
    }

    pub fn save_palette_json(&self, palette_json: &str) -> Result<(), String> {
        let parsed: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(palette_json).map_err(|e| format!("Invalid palette JSON: {}", e))?;

        // Load existing (key -> content_hash) to skip unchanged rows
        let mut existing_hashes = std::collections::HashMap::<String, String>::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT key, content_hash FROM local_scripts")
                .map_err(|e| format!("Failed to query existing script hashes: {}", e))?;
            let rows = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .map_err(|e| format!("Failed to read existing script hashes: {}", e))?;
            for row in rows.flatten() {
                existing_hashes.insert(row.0, row.1);
            }
        }

        // Delete keys that no longer exist
        for old_key in existing_hashes.keys() {
            if !parsed.contains_key(old_key) {
                self.conn
                    .execute("DELETE FROM local_scripts WHERE key = ?1", params![old_key])
                    .map_err(|e| format!("Failed to delete removed script '{}': {}", old_key, e))?;
            }
        }

        for (key, val) in parsed {
            let raw_str = serde_json::to_string(&val).unwrap_or_else(|_| "{}".to_string());
            let content_hash = val
                .get("contentHash")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| sha256_hex(&raw_str));

            // Skip unchanged script
            if existing_hashes.get(&key).map(|h| h == &content_hash).unwrap_or(false) {
                continue;
            }

            let executor = val
                .get("executor")
                .and_then(|v| v.as_str())
                .unwrap_or("python")
                .to_string();
            let last_synced_at = val
                .get("lastSyncedAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            self.conn
                .execute(
                    "
                    INSERT INTO local_scripts (key, raw_json, executor, content_hash, last_synced_at)
                    VALUES (?1, ?2, ?3, ?4, ?5)
                    ON CONFLICT(key) DO UPDATE SET
                        raw_json = excluded.raw_json,
                        executor = excluded.executor,
                        content_hash = excluded.content_hash,
                        last_synced_at = excluded.last_synced_at
                    ",
                    params![key, raw_str, executor, content_hash, last_synced_at],
                )
                .map_err(|e| format!("Failed to upsert script '{}': {}", key, e))?;
        }

        Ok(())
    }

    pub fn load_structs_json(&self) -> Result<String, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT slug, display_name, description, fields_json, updated_at FROM local_structs ORDER BY slug ASC")
            .map_err(|e| format!("Failed to prepare structs query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let slug: String = row.get(0)?;
                let display_name: String = row.get(1)?;
                let description: Option<String> = row.get(2)?;
                let fields_json: String = row.get(3)?;
                let updated_at: String = row.get(4)?;
                Ok((slug, display_name, description, fields_json, updated_at))
            })
            .map_err(|e| format!("Failed to query local_structs: {}", e))?;

        let mut list = Vec::new();
        for row in rows.flatten() {
            let fields: serde_json::Value =
                serde_json::from_str(&row.3).unwrap_or_else(|_| serde_json::json!([]));
            list.push(serde_json::json!({
                "slug": row.0,
                "displayName": row.1,
                "description": row.2.unwrap_or_default(),
                "fields": fields,
                "updatedAt": row.4
            }));
        }

        serde_json::to_string(&list).map_err(|e| format!("Failed to serialize structs: {}", e))
    }

    pub fn save_structs_json(&self, structs_json: &str) -> Result<(), String> {
        let list: Vec<serde_json::Value> =
            serde_json::from_str(structs_json).map_err(|e| format!("Invalid structs JSON: {}", e))?;

        self.conn
            .execute("DELETE FROM local_structs", [])
            .map_err(|e| format!("Failed to clear local_structs: {}", e))?;

        for item in list {
            let slug = item.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if slug.is_empty() {
                continue;
            }
            let display_name = item
                .get("displayName")
                .and_then(|v| v.as_str())
                .unwrap_or(&slug)
                .to_string();
            let description = item
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let fields_json = serde_json::to_string(item.get("fields").unwrap_or(&serde_json::json!([])))
                .unwrap_or_else(|_| "[]".to_string());
            let updated_at = item
                .get("updatedAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let content_hash = sha256_hex(&fields_json);

            self.conn
                .execute(
                    "
                    INSERT INTO local_structs (slug, display_name, description, fields_json, source_kind, content_hash, updated_at)
                    VALUES (?1, ?2, ?3, ?4, 'declarative', ?5, ?6)
                    ",
                    params![slug, display_name, description, fields_json, content_hash, updated_at],
                )
                .map_err(|e| format!("Failed to insert struct '{}': {}", slug, e))?;
        }

        Ok(())
    }

    pub fn load_constants_json(&self) -> Result<String, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, key, value_json, data_type, scope, unreal_path, description, updated_at FROM local_constants ORDER BY key ASC")
            .map_err(|e| format!("Failed to prepare constants query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let key: String = row.get(1)?;
                let value_json: String = row.get(2)?;
                let data_type: String = row.get(3)?;
                let scope: String = row.get(4)?;
                let unreal_path: Option<String> = row.get(5)?;
                let description: Option<String> = row.get(6)?;
                let updated_at: String = row.get(7)?;
                Ok((id, key, value_json, data_type, scope, unreal_path, description, updated_at))
            })
            .map_err(|e| format!("Failed to query local_constants: {}", e))?;

        let mut list = Vec::new();
        for row in rows.flatten() {
            let value: serde_json::Value =
                serde_json::from_str(&row.2).unwrap_or(serde_json::Value::Null);
            let unreal_path = decode_unreal_path(row.5, &value, &row.3, &row.4);
            list.push(serde_json::json!({
                "id": row.0,
                "key": row.1,
                "value": value,
                "dataType": row.3,
                "scope": row.4,
                "unrealPath": unreal_path,
                "description": row.6,
                "updatedAt": row.7
            }));
        }

        serde_json::to_string(&list).map_err(|e| format!("Failed to serialize constants: {}", e))
    }

    pub fn save_pipeline_snapshot(&self, slug: &str, snapshot_json: &str) -> Result<(), String> {
        // Upsert into local_pipelines: update snapshot_json if row exists, or insert stub row if not scanned yet
        let affected = self
            .conn
            .execute(
                "UPDATE local_pipelines SET snapshot_json = ?1 WHERE slug = ?2",
                params![snapshot_json, slug],
            )
            .map_err(|e| format!("Failed to update pipeline snapshot for '{}': {}", slug, e))?;

        if affected == 0 {
            self.conn
                .execute(
                    "
                    INSERT INTO local_pipelines (slug, file_name, relative_path, full_path, pipeline_kind, content_hash, last_modified_ms, snapshot_json)
                    VALUES (?1, ?1, ?1, ?1, 'master', '', 0, ?2)
                    ON CONFLICT(slug) DO UPDATE SET snapshot_json = excluded.snapshot_json
                    ",
                    params![slug, snapshot_json],
                )
                .map_err(|e| format!("Failed to insert pipeline snapshot for '{}': {}", slug, e))?;
        }

        Ok(())
    }

    pub fn load_pipeline_snapshot(&self, slug: &str) -> Result<Option<String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT snapshot_json FROM local_pipelines WHERE slug = ?1")
            .map_err(|e| format!("Failed to prepare load snapshot query: {}", e))?;

        let mut rows = stmt
            .query(params![slug])
            .map_err(|e| format!("Failed to query snapshot for '{}': {}", slug, e))?;

        if let Some(row) = rows.next().map_err(|e| format!("Error reading row: {}", e))? {
            let snap: Option<String> = row.get(0).unwrap_or(None);
            Ok(snap)
        } else {
            Ok(None)
        }
    }

    pub fn delete_pipeline(&self, slug: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM local_pipelines WHERE slug = ?1", params![slug])
            .map_err(|e| format!("Failed to delete pipeline '{}': {}", slug, e))?;
        Ok(())
    }

    pub fn load_component_pipelines(&self) -> Result<Vec<(String, String, String)>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT slug, full_path, relative_path FROM local_pipelines WHERE lower(pipeline_kind) = 'component'",
            )
            .map_err(|e| format!("Failed to prepare component pipelines query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                let slug: String = row.get(0)?;
                let full_path: String = row.get(1)?;
                let relative_path: String = row.get(2)?;
                Ok((slug, full_path, relative_path))
            })
            .map_err(|e| format!("Failed to query local_pipelines: {}", e))?;

        Ok(rows.flatten().collect())
    }

    pub fn save_constants_json(&self, constants_json: &str) -> Result<(), String> {
        let list: Vec<serde_json::Value> = serde_json::from_str(constants_json)
            .map_err(|e| format!("Invalid constants JSON: {}", e))?;

        let mut prepared_rows = Vec::with_capacity(list.len());
        for item in list {
            let key = item.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if key.is_empty() {
                continue;
            }
            let id = item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or(&key)
                .to_string();
            let value_val = item.get("value").unwrap_or(&serde_json::Value::Null);
            let value_json = serde_json::to_string(value_val)
                .unwrap_or_else(|_| "null".to_string());
            let data_type = item
                .get("dataType")
                .and_then(|v| v.as_str())
                .unwrap_or("String")
                .to_string();
            let scope = item
                .get("scope")
                .and_then(|v| v.as_str())
                .unwrap_or("General")
                .to_string();
            let unreal_path = encode_and_validate_unreal_path(
                &key,
                item.get("unrealPath"),
                value_val,
                &data_type,
                &scope,
            )?;
            let description = item
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let updated_at = item
                .get("updatedAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let content_hash = sha256_hex(&format!(
                "{}:{}:{}",
                value_json,
                data_type,
                unreal_path.as_deref().unwrap_or("")
            ));

            prepared_rows.push((
                key,
                id,
                value_json,
                data_type,
                scope,
                unreal_path,
                description,
                content_hash,
                updated_at,
            ));
        }

        self.conn
            .execute("DELETE FROM local_constants", [])
            .map_err(|e| format!("Failed to clear local_constants: {}", e))?;

        for (key, id, value_json, data_type, scope, unreal_path, description, content_hash, updated_at) in prepared_rows {
            self.conn
                .execute(
                    "
                    INSERT INTO local_constants (key, id, value_json, data_type, scope, unreal_path, description, content_hash, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                    ",
                    params![key, id, value_json, data_type, scope, unreal_path, description, content_hash, updated_at],
                )
                .map_err(|e| format!("Failed to insert constant '{}': {}", key, e))?;
        }

        Ok(())
    }

    /// Replaces dependency rows for the given parents inside a single transaction.
    ///
    /// Rows are written with `INSERT OR IGNORE`, so duplicated edges are collapsed by the
    /// composite primary key `(parent_kind, parent_key, dep_kind, dep_key)`.
    pub fn replace_dependencies(
        &self,
        parents: &[(String, String)],
        rows: &[LocalDependencyRow],
    ) -> Result<(), String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| format!("Failed to start dependency transaction: {}", e))?;

        for (parent_kind, parent_key) in parents {
            tx.execute(
                "DELETE FROM local_dependencies WHERE parent_kind = ?1 AND parent_key = ?2",
                params![parent_kind, parent_key],
            )
            .map_err(|e| format!("Failed to clear dependencies for '{}': {}", parent_key, e))?;
        }

        for row in rows {
            tx.execute(
                "
                INSERT OR IGNORE INTO local_dependencies (parent_kind, parent_key, dep_kind, dep_key)
                VALUES (?1, ?2, ?3, ?4)
                ",
                params![
                    row.parent_kind,
                    row.parent_key,
                    row.dep_kind,
                    row.dep_key
                ],
            )
            .map_err(|e| format!("Failed to insert dependency '{}': {}", row.dep_key, e))?;
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit dependency transaction: {}", e))
    }

    /// Loads `(dep_kind, dep_key)` pairs of a parent, sorted by kind then key.
    pub fn load_dependencies(
        &self,
        parent_kind: &str,
        parent_key: &str,
    ) -> Result<Vec<(String, String)>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "
                SELECT dep_kind, dep_key FROM local_dependencies
                WHERE parent_kind = ?1 AND parent_key = ?2
                ORDER BY dep_kind ASC, dep_key ASC
                ",
            )
            .map_err(|e| format!("Failed to prepare dependency query: {}", e))?;

        let rows = stmt
            .query_map(params![parent_kind, parent_key], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query dependencies: {}", e))?;

        Ok(rows.flatten().collect())
    }

    /// Deletes every dependency row of a parent. Used when a pipeline is deleted.
    pub fn delete_dependencies(&self, parent_kind: &str, parent_key: &str) -> Result<(), String> {
        self.conn
            .execute(
                "DELETE FROM local_dependencies WHERE parent_kind = ?1 AND parent_key = ?2",
                params![parent_kind, parent_key],
            )
            .map_err(|e| format!("Failed to delete dependencies for '{}': {}", parent_key, e))?;
        Ok(())
    }
}

fn split_legacy_array_str(raw: &str) -> Vec<serde_json::Value> {
    raw.split([',', '\n'])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| serde_json::Value::String(s.to_string()))
        .collect()
}

fn is_legacy_truncated_unreal_array(
    legacy_str: &str,
    value: &serde_json::Value,
    scope: &str,
) -> Option<Vec<serde_json::Value>> {
    if !scope.eq_ignore_ascii_case("Unreal") {
        return None;
    }
    let val_arr = value.as_array()?;
    if val_arr.len() <= 1 {
        return None;
    }
    let all_game_paths = val_arr.iter().all(|v| {
        v.as_str()
            .map(|s| s.trim().starts_with("/Game/"))
            .unwrap_or(false)
    });
    if !all_game_paths {
        return None;
    }
    let contains_legacy = val_arr
        .iter()
        .any(|v| v.as_str().map(|s| s.trim() == legacy_str).unwrap_or(false));
    if contains_legacy {
        Some(val_arr.clone())
    } else {
        None
    }
}

/// Decodes `unreal_path` column into a typed JSON value (`Array` for `data_type == "Array"`,
/// `String` otherwise), migrating legacy single-string rows cleanly on read.
fn decode_unreal_path(
    raw: Option<String>,
    value: &serde_json::Value,
    data_type: &str,
    scope: &str,
) -> serde_json::Value {
    let Some(raw_str) = raw else {
        return serde_json::Value::Null;
    };
    let trimmed = raw_str.trim();
    if trimmed.is_empty() {
        return if data_type.eq_ignore_ascii_case("Array") {
            serde_json::Value::Array(Vec::new())
        } else {
            serde_json::Value::Null
        };
    }

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
        match parsed {
            serde_json::Value::Array(arr) => return serde_json::Value::Array(arr),
            serde_json::Value::String(s) => {
                if data_type.eq_ignore_ascii_case("Array") {
                    if let Some(recovered) = is_legacy_truncated_unreal_array(s.trim(), value, scope) {
                        return serde_json::Value::Array(recovered);
                    }
                    return serde_json::Value::Array(split_legacy_array_str(&s));
                }
                return serde_json::Value::String(s);
            }
            _ => {}
        }
    }

    if data_type.eq_ignore_ascii_case("Array") {
        if let Some(recovered) = is_legacy_truncated_unreal_array(trimmed, value, scope) {
            return serde_json::Value::Array(recovered);
        }
        return serde_json::Value::Array(split_legacy_array_str(trimmed));
    }

    serde_json::Value::String(trimmed.to_string())
}

/// Validates and serializes `unrealPath` for SQLite persistence.
/// For `Unreal` + `Array` constants, enforces equal array length with `value`.
fn encode_and_validate_unreal_path(
    key: &str,
    unreal_path: Option<&serde_json::Value>,
    value: &serde_json::Value,
    data_type: &str,
    scope: &str,
) -> Result<Option<String>, String> {
    let Some(up) = unreal_path else {
        return Ok(None);
    };
    if up.is_null() {
        return Ok(None);
    }

    let is_array = data_type.eq_ignore_ascii_case("Array");
    let is_unreal = scope.eq_ignore_ascii_case("Unreal");

    match up {
        serde_json::Value::Array(arr) => {
            if is_unreal && is_array {
                let val_len = value.as_array().map(|a| a.len()).unwrap_or(0);
                if arr.len() != val_len {
                    return Err(format!(
                        "Constant '{}': unrealPath array length ({}) must match value array length ({})",
                        key,
                        arr.len(),
                        val_len
                    ));
                }
            }
            let json = serde_json::to_string(arr)
                .map_err(|e| format!("Failed to serialize unrealPath for '{}': {}", key, e))?;
            Ok(Some(json))
        }
        serde_json::Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if is_array {
                let arr = if let Ok(serde_json::Value::Array(parsed)) =
                    serde_json::from_str::<serde_json::Value>(trimmed)
                {
                    parsed
                } else {
                    split_legacy_array_str(trimmed)
                };
                if is_unreal {
                    let val_len = value.as_array().map(|a| a.len()).unwrap_or(0);
                    if arr.len() != val_len {
                        return Err(format!(
                            "Constant '{}': unrealPath array length ({}) must match value array length ({})",
                            key,
                            arr.len(),
                            val_len
                        ));
                    }
                }
                let json = serde_json::to_string(&arr)
                    .map_err(|e| format!("Failed to serialize unrealPath for '{}': {}", key, e))?;
                Ok(Some(json))
            } else {
                Ok(Some(trimmed.to_string()))
            }
        }
        _ => Err(format!(
            "Constant '{}': unrealPath must be a string, array, or null",
            key
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_db_auto_migration_from_legacy_json() {
        let temp_root = std::env::temp_dir().join(format!(
            "forgity_ws_db_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let forgity_dir = temp_root.join(".forgity");
        std::fs::create_dir_all(&forgity_dir).unwrap();

        std::fs::write(
            forgity_dir.join("constants.json"),
            r#"[{"id":"c1","key":"UNREAL_ROOT","value":"/Game/Chars","dataType":"Path","scope":"Unreal"}]"#,
        )
        .unwrap();
        std::fs::write(
            forgity_dir.join("local_structs.json"),
            r#"[{"slug":"char_item","displayName":"Char Item","fields":[]}]"#,
        )
        .unwrap();

        let db = WorkspaceDb::open(&temp_root).unwrap();
        db.migrate_legacy_json_if_needed(&temp_root).unwrap();

        let loaded_constants = db.load_constants_json().unwrap();
        assert!(loaded_constants.contains("UNREAL_ROOT"));
        let loaded_structs = db.load_structs_json().unwrap();
        assert!(loaded_structs.contains("char_item"));
        assert!(forgity_dir.join("constants.json.bak").is_file());
        assert!(temp_root.join("contracts.yaml").is_file());

        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn test_constants_unreal_path_array_roundtrip_and_length_validation() {
        let temp_root = std::env::temp_dir().join(format!(
            "forgity_ws_db_const_arr_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let db = WorkspaceDb::open(&temp_root).unwrap();

        let valid_json = r#"[{
            "id": "c1",
            "key": "PDA_PATHS",
            "value": ["/Game/A", "/Game/B"],
            "dataType": "Array",
            "scope": "Unreal",
            "unrealPath": ["/Game/A", "/Game/B"]
        }]"#;
        db.save_constants_json(valid_json).unwrap();

        let loaded: Vec<serde_json::Value> =
            serde_json::from_str(&db.load_constants_json().unwrap()).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(
            loaded[0]["unrealPath"],
            serde_json::json!(["/Game/A", "/Game/B"])
        );

        let mismatched_json = r#"[{
            "id": "c1",
            "key": "PDA_PATHS",
            "value": ["/Game/A", "/Game/B"],
            "dataType": "Array",
            "scope": "Unreal",
            "unrealPath": ["/Game/B"]
        }]"#;
        let err = db.save_constants_json(mismatched_json).unwrap_err();
        assert!(err.contains("must match value array length"));

        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn test_constants_legacy_unreal_path_migration() {
        let temp_root = std::env::temp_dir().join(format!(
            "forgity_ws_db_const_mig_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let db = WorkspaceDb::open(&temp_root).unwrap();

        // Simulate legacy truncated row saved before Phase 0
        db.conn
            .execute(
                "INSERT INTO local_constants (key, id, value_json, data_type, scope, unreal_path, description, content_hash, updated_at)
                 VALUES ('PDA_PATHS', 'c1', '[\"/Game/A\",\"/Game/B\"]', 'Array', 'Unreal', '/Game/B', NULL, 'h', '')",
                [],
            )
            .unwrap();

        let loaded: Vec<serde_json::Value> =
            serde_json::from_str(&db.load_constants_json().unwrap()).unwrap();
        assert_eq!(
            loaded[0]["unrealPath"],
            serde_json::json!(["/Game/A", "/Game/B"])
        );

        let _ = std::fs::remove_dir_all(&temp_root);
    }
}

