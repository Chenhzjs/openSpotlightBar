use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use directories::UserDirs;
use tauri::{AppHandle, Manager};
use walkdir::{DirEntry, WalkDir};

use crate::{
    db::Database,
    error::{AppError, AppResult},
    models::{FileIndexStatus, FileRecord, LauncherSettings},
    state::AppState,
};

pub const MAX_INDEXED_FILES: usize = 15_000;

pub fn spawn_rebuild(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = rebuild_now(app_handle).await;
    });
}

pub fn load_status(db: &Database, settings: &LauncherSettings) -> AppResult<FileIndexStatus> {
    let indexed_count = db.count_indexed_files()?;
    let saved = db.get_file_index_status()?;
    Ok(reconcile_status(settings, indexed_count, Some(saved)))
}

pub fn reconcile_status(
    settings: &LauncherSettings,
    indexed_count: usize,
    previous: Option<FileIndexStatus>,
) -> FileIndexStatus {
    let indexed_paths = effective_index_paths(&settings.index_paths);
    let excluded_paths = effective_excluded_paths(&settings.index_exclusions);
    let mut status = previous.unwrap_or_default();

    let config_changed =
        status.indexed_paths != indexed_paths || status.excluded_paths != excluded_paths;

    status.indexed_paths = indexed_paths;
    status.excluded_paths = excluded_paths;
    status.indexed_count = indexed_count;
    status.max_indexed_files = MAX_INDEXED_FILES;
    status.paused = settings.indexing_paused;

    if settings.indexing_paused {
        status.state = "paused".to_string();
        status.message = Some(if indexed_count > 0 {
            "Indexing paused. Existing file results remain searchable.".to_string()
        } else {
            "Indexing paused. Resume and rebuild to create the file index.".to_string()
        });
        return status;
    }

    if matches!(status.state.as_str(), "paused" | "indexing") {
        status.state = if indexed_count > 0 {
            "ready".to_string()
        } else {
            "idle".to_string()
        };
        status.message = Some(if indexed_count > 0 {
            "Indexing active. Existing file index is available.".to_string()
        } else {
            "Indexing active. Rebuild to create the file index.".to_string()
        });
    }

    if config_changed && !status.state.eq("indexing") {
        status.state = if indexed_count > 0 {
            "stale".to_string()
        } else {
            "idle".to_string()
        };
        status.message = Some(if indexed_count > 0 {
            "Index settings changed. Rebuild to refresh indexed paths and exclusions.".to_string()
        } else {
            "Add directories and rebuild to create the file index.".to_string()
        });
    }

    status
}

pub async fn rebuild_now(app_handle: AppHandle) -> AppResult<FileIndexStatus> {
    let state = app_handle.state::<AppState>().inner().clone();
    let settings = state.db.get_settings()?;
    let indexed_count = state.db.count_indexed_files()?;

    if settings.indexing_paused {
        let status = reconcile_status(&settings, indexed_count, Some(state.db.get_file_index_status()?));
        set_status(&state, &status)?;
        return Ok(status);
    }

    let indexing_status = FileIndexStatus {
        state: "indexing".to_string(),
        indexed_count,
        indexed_paths: effective_index_paths(&settings.index_paths),
        excluded_paths: effective_excluded_paths(&settings.index_exclusions),
        last_indexed_at: state
            .file_index_status
            .lock()
            .map_err(|e| AppError::MutexPoisoned(e.to_string()))?
            .last_indexed_at,
        message: Some("Indexing lightweight filename, path, and metadata entries...".to_string()),
        last_error: None,
        paused: false,
        truncated: false,
        max_indexed_files: MAX_INDEXED_FILES,
    };
    set_status(&state, &indexing_status)?;

    let started_at = Instant::now();
    let settings_for_scan = settings.clone();
    let collected = match tauri::async_runtime::spawn_blocking(move || {
        collect_files(&settings_for_scan.index_paths, &settings_for_scan.index_exclusions)
    })
    .await
    .map_err(|error| AppError::Message(error.to_string()))?
    {
        Ok(collected) => collected,
        Err(error) => {
            let status = FileIndexStatus {
                state: "error".to_string(),
                indexed_count,
                indexed_paths: effective_index_paths(&settings.index_paths),
                excluded_paths: effective_excluded_paths(&settings.index_exclusions),
                last_indexed_at: indexing_status.last_indexed_at,
                message: Some("File indexing failed. Review the error and rebuild again.".to_string()),
                last_error: Some(error.to_string()),
                paused: false,
                truncated: false,
                max_indexed_files: MAX_INDEXED_FILES,
            };
            set_status(&state, &status)?;
            return Ok(status);
        }
    };

    if let Err(error) = state.db.replace_indexed_files(&collected.files) {
        let status = FileIndexStatus {
            state: "error".to_string(),
            indexed_count,
            indexed_paths: effective_index_paths(&settings.index_paths),
            excluded_paths: effective_excluded_paths(&settings.index_exclusions),
            last_indexed_at: indexing_status.last_indexed_at,
            message: Some("Failed to persist the rebuilt file index.".to_string()),
            last_error: Some(error.to_string()),
            paused: false,
            truncated: false,
            max_indexed_files: MAX_INDEXED_FILES,
        };
        set_status(&state, &status)?;
        return Ok(status);
    }

    let elapsed_ms = started_at.elapsed().as_millis();
    let next_status = FileIndexStatus {
        state: "ready".to_string(),
        indexed_count: collected.files.len(),
        indexed_paths: collected.indexed_paths,
        excluded_paths: collected.excluded_paths,
        last_indexed_at: Some(now_ms()),
        message: Some(if collected.truncated {
            format!(
                "Indexed {} entries in {}ms and hit the current cap of {} items.",
                collected.files.len(),
                elapsed_ms,
                MAX_INDEXED_FILES
            )
        } else {
            format!(
                "Indexed {} filesystem entries in {}ms.",
                collected.files.len(),
                elapsed_ms
            )
        }),
        last_error: None,
        paused: false,
        truncated: collected.truncated,
        max_indexed_files: MAX_INDEXED_FILES,
    };

    set_status(&state, &next_status)?;
    Ok(next_status)
}

struct CollectedFiles {
    files: Vec<FileRecord>,
    indexed_paths: Vec<String>,
    excluded_paths: Vec<String>,
    truncated: bool,
}

fn collect_files(paths: &[String], exclusions: &[String]) -> AppResult<CollectedFiles> {
    let roots = resolve_paths(paths, true);
    let exclusion_paths = resolve_paths(exclusions, false);
    let indexed_paths = roots
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    let excluded_paths = exclusion_paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();

    let mut files = Vec::new();
    let mut truncated = false;

    for root in roots {
        if is_excluded_path(&root, &exclusion_paths) {
            continue;
        }

        for entry in WalkDir::new(root)
            .into_iter()
            .filter_entry(|entry| should_visit(entry, &exclusion_paths))
            .filter_map(Result::ok)
        {
            if files.len() >= MAX_INDEXED_FILES {
                truncated = true;
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

        if truncated {
            break;
        }
    }

    Ok(CollectedFiles {
        files,
        indexed_paths,
        excluded_paths,
        truncated,
    })
}

fn set_status(state: &AppState, status: &FileIndexStatus) -> AppResult<()> {
    {
        let mut guard = state
            .file_index_status
            .lock()
            .map_err(|e| AppError::MutexPoisoned(e.to_string()))?;
        *guard = status.clone();
    }

    state.db.save_file_index_status(status)?;
    Ok(())
}

fn effective_index_paths(paths: &[String]) -> Vec<String> {
    resolve_paths(paths, true)
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn effective_excluded_paths(paths: &[String]) -> Vec<String> {
    resolve_paths(paths, false)
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn resolve_paths(paths: &[String], require_existing: bool) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut resolved = if paths.is_empty() && require_existing {
        default_roots()
    } else {
        paths.iter().map(|value| expand_tilde(value)).collect::<Vec<_>>()
    };

    resolved.retain(|path| !require_existing || path.exists());
    resolved.retain(|path| seen.insert(path.to_string_lossy().to_string()));
    resolved
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

fn should_visit(entry: &DirEntry, excluded_paths: &[PathBuf]) -> bool {
    let file_name = entry.file_name().to_string_lossy();
    if matches!(
        file_name.as_ref(),
        ".git" | "node_modules" | "target" | ".DS_Store" | "Library" | ".cache"
    ) {
        return false;
    }

    !is_excluded_path(entry.path(), excluded_paths)
}

fn is_excluded_path(path: &Path, excluded_paths: &[PathBuf]) -> bool {
    excluded_paths.iter().any(|excluded| path.starts_with(excluded))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
