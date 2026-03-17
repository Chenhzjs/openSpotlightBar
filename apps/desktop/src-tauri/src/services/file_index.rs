use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use directories::UserDirs;
use tauri::{AppHandle, Manager};
use walkdir::{DirEntry, WalkDir};

use crate::{
    error::AppResult,
    models::{FileIndexStatus, FileRecord},
    state::AppState,
};

const MAX_INDEXED_FILES: usize = 15_000;

pub fn spawn_rebuild(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = rebuild_now(app_handle).await;
    });
}

pub async fn rebuild_now(app_handle: AppHandle) -> AppResult<FileIndexStatus> {
    let state = app_handle.state::<AppState>().inner().clone();
    {
        let mut guard = state
            .file_index_status
            .lock()
            .expect("file index status mutex poisoned");
        *guard = FileIndexStatus {
            state: "indexing".to_string(),
            indexed_count: 0,
            last_indexed_at: guard.last_indexed_at,
            message: Some("Indexing lightweight file metadata...".to_string()),
        };
    }

    let settings = state.db.get_settings()?;
    let files = tauri::async_runtime::spawn_blocking(move || collect_files(&settings.index_paths))
        .await
        .map_err(|error| crate::error::AppError::Message(error.to_string()))??;
    state.db.replace_indexed_files(&files)?;

    let next_status = FileIndexStatus {
        state: "ready".to_string(),
        indexed_count: files.len(),
        last_indexed_at: Some(now_ms()),
        message: Some(format!("Indexed {} filesystem entries.", files.len())),
    };

    {
        let mut guard = state
            .file_index_status
            .lock()
            .expect("file index status mutex poisoned");
        *guard = next_status.clone();
    }

    Ok(next_status)
}

fn collect_files(paths: &[String]) -> AppResult<Vec<FileRecord>> {
    let mut roots = if paths.is_empty() {
        default_roots()
    } else {
        paths.iter().map(|value| expand_tilde(value)).collect()
    };

    roots.retain(|path| path.exists());

    let mut files = Vec::new();
    for root in roots {
        for entry in WalkDir::new(root)
            .into_iter()
            .filter_entry(|entry| should_visit(entry))
            .filter_map(Result::ok)
        {
            if files.len() >= MAX_INDEXED_FILES {
                break;
            }

            if entry.depth() == 0 {
                continue;
            }

            let path = entry.path();
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            let kind = if metadata.is_dir() { "folder" } else { "file" };
            let name = match path.file_name().and_then(|value| value.to_str()) {
                Some(value) => value.to_string(),
                None => continue,
            };
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_string);
            let mtime_ms = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_millis() as i64)
                .unwrap_or_else(now_ms);

            files.push(FileRecord {
                path: path.to_string_lossy().to_string(),
                name,
                kind: kind.to_string(),
                extension,
                mtime_ms,
            });
        }
    }

    Ok(files)
}

fn default_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(user_dirs) = UserDirs::new() {
        roots.push(user_dirs.home_dir().join("Desktop"));
        roots.push(user_dirs.home_dir().join("Documents"));
        roots.push(user_dirs.home_dir().join("Downloads"));
    }
    roots
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(user_dirs) = UserDirs::new() {
            return user_dirs.home_dir().join(stripped);
        }
    }
    PathBuf::from(path)
}

fn should_visit(entry: &DirEntry) -> bool {
    let file_name = entry.file_name().to_string_lossy();
    !matches!(
        file_name.as_ref(),
        ".git" | "node_modules" | "target" | ".DS_Store" | "Library" | ".cache"
    )
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
