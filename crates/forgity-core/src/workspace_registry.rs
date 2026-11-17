use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const REGISTRY_DB_FILE: &str = "workspace_registry.db";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredWorkspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub linked_project_id: Option<String>,
    pub origin_template_id: Option<String>,
    pub origin_version_id: Option<String>,
    pub origin_template_title: Option<String>,
    pub last_opened_at: String,
    pub created_at: String,
}

pub struct WorkspaceRegistryDb {
    conn: Connection,
}

impl WorkspaceRegistryDb {
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        let forgity_app_dir = app_data_dir.join("forgity");
        std::fs::create_dir_all(&forgity_app_dir)
            .map_err(|e| format!("Failed to create AppData forgity directory: {}", e))?;

        let db_path: PathBuf = forgity_app_dir.join(REGISTRY_DB_FILE);
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open workspace_registry.db: {}", e))?;

        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;

            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL UNIQUE,
                linked_project_id TEXT,
                origin_template_id TEXT,
                origin_version_id TEXT,
                origin_template_title TEXT,
                last_opened_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_workspaces_last_opened ON workspaces (last_opened_at DESC);
            CREATE INDEX IF NOT EXISTS idx_workspaces_linked_proj ON workspaces (linked_project_id);
            ",
        )
        .map_err(|e| format!("Failed to initialize workspace_registry.db schema: {}", e))?;

        Ok(Self { conn })
    }

    pub fn list_workspaces(&self) -> Result<Vec<RegisteredWorkspace>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, root_path, linked_project_id, origin_template_id, origin_version_id, origin_template_title, last_opened_at, created_at 
                 FROM workspaces ORDER BY last_opened_at DESC",
            )
            .map_err(|e| format!("Failed to prepare list_workspaces query: {}", e))?;

        let rows = stmt
            .query_map([], |r| {
                Ok(RegisteredWorkspace {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    root_path: r.get(2)?,
                    linked_project_id: r.get(3)?,
                    origin_template_id: r.get(4)?,
                    origin_version_id: r.get(5)?,
                    origin_template_title: r.get(6)?,
                    last_opened_at: r.get(7)?,
                    created_at: r.get(8)?,
                })
            })
            .map_err(|e| format!("Query workspaces failed: {}", e))?;

        let mut list = Vec::new();
        for r in rows.flatten() {
            list.push(r);
        }
        Ok(list)
    }

    pub fn get_workspace_by_id(&self, id: &str) -> Result<Option<RegisteredWorkspace>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, root_path, linked_project_id, origin_template_id, origin_version_id, origin_template_title, last_opened_at, created_at 
                 FROM workspaces WHERE id = ?1",
            )
            .map_err(|e| format!("Failed to prepare get_workspace query: {}", e))?;

        let mut rows = stmt
            .query_map(params![id], |r| {
                Ok(RegisteredWorkspace {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    root_path: r.get(2)?,
                    linked_project_id: r.get(3)?,
                    origin_template_id: r.get(4)?,
                    origin_version_id: r.get(5)?,
                    origin_template_title: r.get(6)?,
                    last_opened_at: r.get(7)?,
                    created_at: r.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query workspace by id: {}", e))?;

        Ok(rows.next().transpose().unwrap_or(None))
    }

    pub fn get_workspace_by_root_path(&self, root_path: &str) -> Result<Option<RegisteredWorkspace>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, root_path, linked_project_id, origin_template_id, origin_version_id, origin_template_title, last_opened_at, created_at 
                 FROM workspaces WHERE root_path = ?1",
            )
            .map_err(|e| format!("Failed to prepare get_workspace_by_root_path query: {}", e))?;

        let mut rows = stmt
            .query_map(params![root_path], |r| {
                Ok(RegisteredWorkspace {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    root_path: r.get(2)?,
                    linked_project_id: r.get(3)?,
                    origin_template_id: r.get(4)?,
                    origin_version_id: r.get(5)?,
                    origin_template_title: r.get(6)?,
                    last_opened_at: r.get(7)?,
                    created_at: r.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query workspace by root_path: {}", e))?;

        Ok(rows.next().transpose().unwrap_or(None))
    }

    pub fn upsert_workspace(&self, ws: &RegisteredWorkspace) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO workspaces (id, name, root_path, linked_project_id, origin_template_id, origin_version_id, origin_template_title, last_opened_at, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(root_path) DO UPDATE SET
                    name = excluded.name,
                    linked_project_id = COALESCE(excluded.linked_project_id, workspaces.linked_project_id),
                    origin_template_id = COALESCE(excluded.origin_template_id, workspaces.origin_template_id),
                    origin_version_id = COALESCE(excluded.origin_version_id, workspaces.origin_version_id),
                    origin_template_title = COALESCE(excluded.origin_template_title, workspaces.origin_template_title),
                    last_opened_at = excluded.last_opened_at",
                params![
                    ws.id,
                    ws.name,
                    ws.root_path,
                    ws.linked_project_id,
                    ws.origin_template_id,
                    ws.origin_version_id,
                    ws.origin_template_title,
                    ws.last_opened_at,
                    ws.created_at,
                ],
            )
            .map_err(|e| format!("Failed to upsert workspace into registry: {}", e))?;

        Ok(())
    }

    pub fn touch_workspace(&self, id: &str, timestamp: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE workspaces SET last_opened_at = ?1 WHERE id = ?2",
                params![timestamp, id],
            )
            .map_err(|e| format!("Failed to touch workspace: {}", e))?;
        Ok(())
    }

    pub fn remove_workspace(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM workspaces WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to remove workspace: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_workspace_registry_crud() {
        let dir = tempdir().unwrap();
        let registry = WorkspaceRegistryDb::open(dir.path()).unwrap();

        let ws = RegisteredWorkspace {
            id: "ws-1".to_string(),
            name: "My Local Workspace".to_string(),
            root_path: "D:/Workspaces/ProjectA".to_string(),
            linked_project_id: None,
            origin_template_id: Some("tpl-123".to_string()),
            origin_version_id: Some("v1".to_string()),
            origin_template_title: Some("VFX Pack".to_string()),
            last_opened_at: "2026-11-17T12:00:00Z".to_string(),
            created_at: "2026-11-17T10:00:00Z".to_string(),
        };

        registry.upsert_workspace(&ws).unwrap();

        let list = registry.list_workspaces().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "My Local Workspace");

        let fetched = registry.get_workspace_by_id("ws-1").unwrap().unwrap();
        assert_eq!(fetched.root_path, "D:/Workspaces/ProjectA");

        registry.touch_workspace("ws-1", "2026-11-17T13:00:00Z").unwrap();
        let updated = registry.get_workspace_by_id("ws-1").unwrap().unwrap();
        assert_eq!(updated.last_opened_at, "2026-11-17T13:00:00Z");

        registry.remove_workspace("ws-1").unwrap();
        let empty_list = registry.list_workspaces().unwrap();
        assert_eq!(empty_list.len(), 0);
    }
}
