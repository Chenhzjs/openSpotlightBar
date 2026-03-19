use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{
        BootstrapPayload, ClipboardItem, DiscoveredPlugin, FileIndexStatus, FileRecord,
        LauncherSettings, SnippetInput, SnippetRecord, UsageStat, WorkflowRecord,
    },
};

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn new(base_dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(base_dir)?;
        let database_path = base_dir.join("open-spotlight-bar.sqlite");
        let connection = Connection::open(database_path)?;
        let database = Self {
            connection: Mutex::new(connection),
        };
        database.init()?;
        Ok(database)
    }

    fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|e| AppError::MutexPoisoned(e.to_string()))
    }

    pub fn init(&self) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS usage_stats (
              item_id TEXT PRIMARY KEY,
              item_type TEXT NOT NULL,
              query TEXT,
              selected_count INTEGER DEFAULT 0,
              last_selected_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS indexed_files (
              path TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              kind TEXT NOT NULL,
              extension TEXT,
              mtime_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS clipboard_items (
              id TEXT PRIMARY KEY,
              content_type TEXT NOT NULL,
              text TEXT,
              preview TEXT NOT NULL,
              pinned INTEGER DEFAULT 0,
              created_at INTEGER NOT NULL,
              source_app TEXT,
              metadata_json TEXT
            );
            CREATE TABLE IF NOT EXISTS snippets (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              trigger TEXT NOT NULL UNIQUE,
              content TEXT NOT NULL,
              enabled INTEGER DEFAULT 1,
              scope TEXT,
              app_restriction TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workflows (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              trigger_type TEXT NOT NULL,
              trigger_command TEXT,
              enabled INTEGER DEFAULT 1,
              built_in INTEGER DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              definition_json TEXT NOT NULL
            );
        "#,
        )?;
        drop(connection);

        let settings = self.get_settings()?;
        self.save_settings(&settings)?;
        Ok(())
    }

    pub fn bootstrap(
        &self,
        file_index_status: FileIndexStatus,
        plugins: Vec<DiscoveredPlugin>,
    ) -> AppResult<BootstrapPayload> {
        Ok(BootstrapPayload {
            settings: self.get_settings()?,
            usage_stats: self.list_usage_stats()?,
            file_index_status,
            clipboard_items: self.list_clipboard_items()?,
            snippets: self.list_snippets()?,
            plugins,
            workflows: self.list_workflows()?,
        })
    }

    pub fn get_settings(&self) -> AppResult<LauncherSettings> {
        let connection = self.conn()?;
        let raw = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'launcher_settings'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        drop(connection);

        match raw {
            Some(value) => {
                Ok(serde_json::from_str(&value).unwrap_or_else(|_| LauncherSettings::default()))
            }
            None => Ok(LauncherSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &LauncherSettings) -> AppResult<()> {
        let connection = self.conn()?;
        let raw = serde_json::to_string(settings)?;
        connection.execute(
            "INSERT INTO settings (key, value) VALUES ('launcher_settings', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [raw],
        )?;
        Ok(())
    }

    pub fn get_file_index_status(&self) -> AppResult<FileIndexStatus> {
        let connection = self.conn()?;
        let raw = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'file_index_status'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        drop(connection);

        match raw {
            Some(value) => Ok(serde_json::from_str(&value).unwrap_or_default()),
            None => Ok(FileIndexStatus::default()),
        }
    }

    pub fn save_file_index_status(&self, status: &FileIndexStatus) -> AppResult<()> {
        let connection = self.conn()?;
        let raw = serde_json::to_string(status)?;
        connection.execute(
            "INSERT INTO settings (key, value) VALUES ('file_index_status', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [raw],
        )?;
        Ok(())
    }

    pub fn list_usage_stats(&self) -> AppResult<Vec<UsageStat>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT item_id, item_type, query, selected_count, last_selected_at
             FROM usage_stats
             ORDER BY selected_count DESC, last_selected_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(UsageStat {
                item_id: row.get(0)?,
                item_type: row.get(1)?,
                query: row.get(2)?,
                selected_count: row.get(3)?,
                last_selected_at: row.get(4)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn record_selection(&self, item_id: &str, item_type: &str, query: &str) -> AppResult<()> {
        let connection = self.conn()?;
        let now = now_ms();
        connection.execute(
            "INSERT INTO usage_stats (item_id, item_type, query, selected_count, last_selected_at)
             VALUES (?1, ?2, ?3, 1, ?4)
             ON CONFLICT(item_id) DO UPDATE SET
               item_type = excluded.item_type,
               query = excluded.query,
               selected_count = usage_stats.selected_count + 1,
               last_selected_at = excluded.last_selected_at",
            params![item_id, item_type, query, now],
        )?;
        Ok(())
    }

    pub fn list_clipboard_items(&self) -> AppResult<Vec<ClipboardItem>> {
        let settings = self.get_settings()?;
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, content_type, text, preview, pinned, created_at, source_app, metadata_json
             FROM clipboard_items
             ORDER BY pinned DESC, created_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map([settings.clipboard.max_items as i64], |row| {
            let metadata_json: Option<String> = row.get(7)?;
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                text: row.get(2)?,
                preview: row.get(3)?,
                pinned: row.get::<_, i64>(4)? == 1,
                created_at: row.get(5)?,
                source_app: row.get(6)?,
                metadata: metadata_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str(value).ok()),
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn insert_clipboard_text(
        &self,
        text: &str,
        source_app: Option<&str>,
        max_items: usize,
    ) -> AppResult<()> {
        let preview = text
            .lines()
            .next()
            .unwrap_or(text)
            .chars()
            .take(120)
            .collect::<String>();
        let connection = self.conn()?;
        let existing = connection
            .query_row(
                "SELECT id FROM clipboard_items WHERE content_type = 'text' AND text = ?1 LIMIT 1",
                [text],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if let Some(id) = existing {
            connection.execute(
                "UPDATE clipboard_items
                 SET preview = ?2, created_at = ?3, source_app = ?4
                 WHERE id = ?1",
                params![id, preview, now_ms(), source_app],
            )?;
        } else {
            connection.execute(
                "INSERT INTO clipboard_items
                 (id, content_type, text, preview, pinned, created_at, source_app, metadata_json)
                 VALUES (?1, 'text', ?2, ?3, 0, ?4, ?5, NULL)",
                params![
                    Uuid::new_v4().to_string(),
                    text,
                    preview,
                    now_ms(),
                    source_app
                ],
            )?;
        }

        connection.execute(
            "DELETE FROM clipboard_items
             WHERE id IN (
               SELECT id FROM clipboard_items
               WHERE pinned = 0
               ORDER BY created_at DESC
               LIMIT -1 OFFSET ?1
             )",
            [max_items as i64],
        )?;
        Ok(())
    }

    pub fn set_clipboard_pinned(&self, item_id: &str, pinned: bool) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute(
            "UPDATE clipboard_items SET pinned = ?2 WHERE id = ?1",
            params![item_id, if pinned { 1 } else { 0 }],
        )?;
        Ok(())
    }

    pub fn delete_clipboard_item(&self, item_id: &str) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute("DELETE FROM clipboard_items WHERE id = ?1", [item_id])?;
        Ok(())
    }

    pub fn clear_clipboard_items(&self) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute("DELETE FROM clipboard_items", [])?;
        Ok(())
    }

    pub fn list_snippets(&self) -> AppResult<Vec<SnippetRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, name, trigger, content, enabled, scope, app_restriction, created_at, updated_at
             FROM snippets
             ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(SnippetRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                trigger: row.get(2)?,
                content: row.get(3)?,
                enabled: row.get::<_, i64>(4)? == 1,
                scope: row.get(5)?,
                app_restriction: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn get_snippet(&self, id: &str) -> AppResult<Option<SnippetRecord>> {
        let connection = self.conn()?;
        connection
            .query_row(
                "SELECT id, name, trigger, content, enabled, scope, app_restriction, created_at, updated_at
                 FROM snippets
                 WHERE id = ?1",
                [id],
                |row| {
                    Ok(SnippetRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        trigger: row.get(2)?,
                        content: row.get(3)?,
                        enabled: row.get::<_, i64>(4)? == 1,
                        scope: row.get(5)?,
                        app_restriction: row.get(6)?,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn save_snippet(&self, snippet: &SnippetInput) -> AppResult<SnippetRecord> {
        let connection = self.conn()?;
        let now = now_ms();
        let id = snippet
            .id
            .as_ref()
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let created_at = connection
            .query_row(
                "SELECT created_at FROM snippets WHERE id = ?1",
                [id.clone()],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .unwrap_or(now);

        connection.execute(
            "INSERT INTO snippets
             (id, name, trigger, content, enabled, scope, app_restriction, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               trigger = excluded.trigger,
               content = excluded.content,
               enabled = excluded.enabled,
               scope = excluded.scope,
               app_restriction = excluded.app_restriction,
               updated_at = excluded.updated_at",
            params![
                id,
                snippet.name,
                snippet.trigger,
                snippet.content,
                if snippet.enabled { 1 } else { 0 },
                snippet.scope,
                snippet.app_restriction,
                created_at,
                now
            ],
        )?;

        Ok(SnippetRecord {
            id,
            name: snippet.name.clone(),
            trigger: snippet.trigger.clone(),
            content: snippet.content.clone(),
            enabled: snippet.enabled,
            scope: snippet.scope.clone(),
            app_restriction: snippet.app_restriction.clone(),
            created_at,
            updated_at: now,
        })
    }

    pub fn delete_snippet(&self, id: &str) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute("DELETE FROM snippets WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn list_workflows(&self) -> AppResult<Vec<WorkflowRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT definition_json
             FROM workflows
             ORDER BY built_in DESC, updated_at DESC, name ASC",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        let workflows = rows
            .filter_map(Result::ok)
            .filter_map(|raw| serde_json::from_str::<WorkflowRecord>(&raw).ok())
            .collect();
        Ok(workflows)
    }

    pub fn save_workflow(&self, workflow: &WorkflowRecord) -> AppResult<WorkflowRecord> {
        let connection = self.conn()?;
        let now = now_ms();
        let id = if workflow.id.trim().is_empty() {
            Uuid::new_v4().to_string()
        } else {
            workflow.id.clone()
        };

        let created_at = connection
            .query_row(
                "SELECT created_at FROM workflows WHERE id = ?1",
                [id.clone()],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .unwrap_or_else(|| {
                if workflow.created_at > 0 {
                    workflow.created_at
                } else {
                    now
                }
            });

        let saved = WorkflowRecord {
            id,
            name: workflow.name.clone(),
            description: workflow.description.clone(),
            enabled: workflow.enabled,
            built_in: workflow.built_in,
            reusable: workflow.reusable.clone(),
            tags: workflow.tags.clone(),
            trigger: workflow.trigger.clone(),
            nodes: workflow.nodes.clone(),
            edges: workflow.edges.clone(),
            created_at,
            updated_at: now,
        };

        let raw = serde_json::to_string(&saved)?;
        connection.execute(
            "INSERT INTO workflows
             (id, name, trigger_type, trigger_command, enabled, built_in, created_at, updated_at, definition_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               trigger_type = excluded.trigger_type,
               trigger_command = excluded.trigger_command,
               enabled = excluded.enabled,
               built_in = excluded.built_in,
               updated_at = excluded.updated_at,
               definition_json = excluded.definition_json",
            params![
                saved.id,
                saved.name,
                saved.trigger.trigger_type,
                saved.trigger.command,
                if saved.enabled { 1 } else { 0 },
                if saved.built_in { 1 } else { 0 },
                saved.created_at,
                saved.updated_at,
                raw
            ],
        )?;

        Ok(saved)
    }

    pub fn delete_workflow(&self, id: &str) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute("DELETE FROM workflows WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn search_files(&self, query: &str, limit: usize) -> AppResult<Vec<FileRecord>> {
        let connection = self.conn()?;
        let normalized = query.trim().to_lowercase();
        if normalized.is_empty() {
            return Ok(Vec::new());
        }

        let prefix = format!("{normalized}%");
        let pattern = format!("%{normalized}%");
        let mut statement = connection.prepare(
            "SELECT path, name, kind, extension, mtime_ms
             FROM indexed_files
             WHERE lower(name) LIKE ?3 OR lower(path) LIKE ?3
             ORDER BY
               CASE
                 WHEN lower(name) = ?1 THEN 6
                 WHEN lower(path) = ?1 THEN 5
                 WHEN lower(name) LIKE ?2 THEN 4
                 WHEN lower(path) LIKE ?2 THEN 3
                 WHEN lower(name) LIKE ?3 THEN 2
                 ELSE 1
               END DESC,
               mtime_ms DESC,
               length(name) ASC
             LIMIT ?4",
        )?;
        let rows = statement.query_map(params![normalized, prefix, pattern, limit as i64], |row| {
            Ok(FileRecord {
                path: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                extension: row.get(3)?,
                mtime_ms: row.get(4)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn count_indexed_files(&self) -> AppResult<usize> {
        let connection = self.conn()?;
        let count = connection.query_row("SELECT COUNT(*) FROM indexed_files", [], |row| {
            row.get::<_, i64>(0)
        })?;
        Ok(count.max(0) as usize)
    }

    pub fn replace_indexed_files(&self, files: &[FileRecord]) -> AppResult<()> {
        let mut connection = self.conn()?;
        let transaction = connection.transaction()?;
        transaction.execute("DELETE FROM indexed_files", [])?;
        {
            let mut statement = transaction.prepare(
                "INSERT INTO indexed_files (path, name, kind, extension, mtime_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for file in files {
                statement.execute(params![
                    file.path,
                    file.name,
                    file.kind,
                    file.extension,
                    file.mtime_ms
                ])?;
            }
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn upsert_indexed_files(&self, files: &[FileRecord]) -> AppResult<()> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "INSERT OR REPLACE INTO indexed_files (path, name, kind, extension, mtime_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        for file in files {
            statement.execute(params![
                file.path,
                file.name,
                file.kind,
                file.extension,
                file.mtime_ms
            ])?;
        }
        Ok(())
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
