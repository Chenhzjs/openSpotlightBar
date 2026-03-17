use std::{path::Path, process::Command as StdCommand, time::Duration};

use arboard::Clipboard;
use chrono::Local;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tokio::process::Command as TokioCommand;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{
        ActionItem, ActionResponse, AppRecord, BootstrapPayload, ClipboardItem, FileIndexStatus,
        FileRecord, LauncherSettings, ResultItem, ShellCommandResult, SnippetInput, SnippetRecord,
    },
    services::{file_index, plugins},
    state::AppState,
    update_hotkey,
};

#[tauri::command]
pub async fn bootstrap_state(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BootstrapPayload, String> {
    let file_index_status = state
        .file_index_status
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    let plugins = plugins::discover_plugins(&app).map_err(|error| error.to_string())?;
    state
        .db
        .bootstrap(file_index_status, plugins)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_apps(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<AppRecord>, String> {
    let normalized = query.trim().to_lowercase();
    let cache = state
        .app_cache
        .lock()
        .map_err(|error| error.to_string())?
        .clone();

    let mut results = cache
        .into_iter()
        .filter(|entry| {
            if normalized.is_empty() {
                return true;
            }

            entry.name.to_lowercase().contains(&normalized)
                || entry.path.to_lowercase().contains(&normalized)
                || entry
                    .keywords
                    .iter()
                    .any(|keyword| keyword.to_lowercase().contains(&normalized))
        })
        .collect::<Vec<_>>();

    results.sort_by(|left, right| {
        let left_prefix = left.name.to_lowercase().starts_with(&normalized);
        let right_prefix = right.name.to_lowercase().starts_with(&normalized);
        right_prefix
            .cmp(&left_prefix)
            .then_with(|| left.name.cmp(&right.name))
    });
    results.truncate(24);
    Ok(results)
}

#[tauri::command]
pub async fn search_files(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    state
        .db
        .search_files(&query, 32)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_clipboard_items(
    state: State<'_, AppState>,
) -> Result<Vec<ClipboardItem>, String> {
    state
        .db
        .list_clipboard_items()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_snippets(state: State<'_, AppState>) -> Result<Vec<SnippetRecord>, String> {
    state.db.list_snippets().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_snippet(
    snippet: SnippetInput,
    state: State<'_, AppState>,
) -> Result<SnippetRecord, String> {
    state
        .db
        .save_snippet(&snippet)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_snippet(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .delete_snippet(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    settings: LauncherSettings,
    state: State<'_, AppState>,
) -> Result<LauncherSettings, String> {
    let previous = state.db.get_settings().map_err(|error| error.to_string())?;
    state
        .db
        .save_settings(&settings)
        .map_err(|error| error.to_string())?;

    if previous.hotkey != settings.hotkey {
        update_hotkey(&app, &settings.hotkey).map_err(|error| error.to_string())?;
    }

    Ok(settings)
}

#[tauri::command]
pub async fn plugin_exec_shell(
    plugin_id: String,
    command: String,
    state: State<'_, AppState>,
) -> Result<ShellCommandResult, String> {
    ensure_plugin_permission(state.inner(), &plugin_id, "shell.exec")
        .map_err(|error| error.to_string())?;

    let timeout_ms = state
        .db
        .get_settings()
        .map_err(|error| error.to_string())?
        .plugins
        .timeout_ms
        .max(500);

    let output = tokio::time::timeout(
        Duration::from_millis(timeout_ms),
        run_shell_command(&command),
    )
    .await
    .map_err(|_| format!("Shell command timed out after {timeout_ms}ms"))?
    .map_err(|error| error.to_string())?;

    Ok(output)
}

#[tauri::command]
pub async fn plugin_read_clipboard_text(
    plugin_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_plugin_permission(state.inner(), &plugin_id, "clipboard.read")
        .map_err(|error| error.to_string())?;

    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.get_text().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn plugin_write_clipboard_text(
    plugin_id: String,
    text: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_plugin_permission(state.inner(), &plugin_id, "clipboard.write")
        .map_err(|error| error.to_string())?;

    set_clipboard_text(&text).map_err(|error| error.to_string())?;

    if let Ok(settings) = state.db.get_settings() {
        let _ = state
            .db
            .insert_clipboard_text(&text, Some("plugin"), settings.clipboard.max_items);
    }

    Ok(())
}

#[tauri::command]
pub async fn record_selection(
    item_id: String,
    item_type: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .record_selection(&item_id, &item_type, &query)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn rebuild_file_index(app: AppHandle) -> Result<FileIndexStatus, String> {
    file_index::rebuild_now(app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_file_index_status(state: State<'_, AppState>) -> Result<FileIndexStatus, String> {
    state
        .file_index_status
        .lock()
        .map_err(|error| error.to_string())
        .map(|status| status.clone())
}

#[tauri::command]
pub async fn perform_action(
    action: ActionItem,
    result: Option<ResultItem>,
    state: State<'_, AppState>,
) -> Result<ActionResponse, String> {
    execute_action(&action, result.as_ref(), state.inner()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn hide_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window was not found".to_string())?;
    window.hide().map_err(|error| error.to_string())
}

fn execute_action(
    action: &ActionItem,
    result: Option<&ResultItem>,
    state: &AppState,
) -> AppResult<ActionResponse> {
    match action.kind.as_str() {
        "launch-app" => {
            let launch_target = payload_string(action, "launchTarget")
                .or_else(|| {
                    result.and_then(|item| payload_string_from_value(&item.payload, "launchTarget"))
                })
                .ok_or_else(|| AppError::from("Missing launch target"))?;
            let launch_target_type = payload_string(action, "launchTargetType")
                .or_else(|| {
                    result.and_then(|item| {
                        payload_string_from_value(&item.payload, "launchTargetType")
                    })
                })
                .unwrap_or_else(|| "path".to_string());

            if launch_target_type == "command" {
                open_command_target(&launch_target)?;
            } else {
                opener::open(Path::new(&launch_target))
                    .map_err(|error| AppError::Message(error.to_string()))?;
            }
            Ok(success(Some("Application launched.")))
        }
        "open-path" => {
            let path = required_payload(action, result, "path")?;
            opener::open(Path::new(&path)).map_err(|error| AppError::Message(error.to_string()))?;
            Ok(success(None))
        }
        "open-url" | "search-web" => {
            let url = required_payload(action, result, "url")?;
            opener::open(url).map_err(|error| AppError::Message(error.to_string()))?;
            Ok(success(None))
        }
        "copy-path" => {
            let path = required_payload(action, result, "path")?;
            set_clipboard_text(&path)?;
            Ok(success(Some("Path copied.")))
        }
        "copy-text" => {
            let text = required_payload(action, result, "text")?;
            set_clipboard_text(&text)?;
            Ok(success(Some("Copied to clipboard.")))
        }
        "paste-text" => {
            let text = required_payload(action, result, "text")?;
            set_clipboard_text(&text)?;
            Ok(success(Some(
                "Copied to clipboard. TODO: add OS-level paste simulation hooks.",
            )))
        }
        "pin-clipboard-item" => {
            let item_id = required_payload(action, result, "itemId")?;
            state.db.set_clipboard_pinned(&item_id, true)?;
            Ok(success(Some("Clipboard item pinned.")))
        }
        "unpin-clipboard-item" => {
            let item_id = required_payload(action, result, "itemId")?;
            state.db.set_clipboard_pinned(&item_id, false)?;
            Ok(success(Some("Clipboard item unpinned.")))
        }
        "delete-clipboard-item" => {
            let item_id = required_payload(action, result, "itemId")?;
            state.db.delete_clipboard_item(&item_id)?;
            Ok(success(Some("Clipboard item deleted.")))
        }
        "clear-clipboard-history" => {
            state.db.clear_clipboard_items()?;
            Ok(success(Some("Clipboard history cleared.")))
        }
        "expand-snippet" => {
            let snippet_id = required_payload(action, result, "snippetId")?;
            let snippet = state
                .db
                .get_snippet(&snippet_id)?
                .ok_or_else(|| AppError::from("Snippet not found"))?;
            let expanded = expand_snippet_content(&snippet.content)?;
            set_clipboard_text(&expanded)?;
            // TODO: Wire this expansion path into global text insertion hooks per platform.
            Ok(success(Some(
                format!("Expanded snippet {}.", snippet.trigger).as_str(),
            )))
        }
        "reveal-in-folder" => {
            let path = required_payload(action, result, "path")?;
            reveal_in_folder(&path)?;
            Ok(success(None))
        }
        "open-in-terminal" => {
            let path = required_payload(action, result, "path")?;
            open_in_terminal(&path)?;
            Ok(success(None))
        }
        "noop" => Ok(success(None)),
        other => Err(AppError::Message(format!(
            "Unsupported action kind: {other}"
        ))),
    }
}

fn required_payload(
    action: &ActionItem,
    result: Option<&ResultItem>,
    key: &str,
) -> AppResult<String> {
    payload_string(action, key)
        .or_else(|| result.and_then(|item| payload_string_from_value(&item.payload, key)))
        .ok_or_else(|| AppError::Message(format!("Missing payload field: {key}")))
}

fn payload_string(action: &ActionItem, key: &str) -> Option<String> {
    action
        .payload
        .as_ref()
        .and_then(|value| payload_string_from_value(value, key))
}

fn payload_string_from_value(payload: &Value, key: &str) -> Option<String> {
    payload
        .as_object()
        .and_then(|value| value.get(key))
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
}

fn success(message: Option<&str>) -> ActionResponse {
    ActionResponse {
        ok: true,
        message: message.map(ToString::to_string),
    }
}

fn set_clipboard_text(text: &str) -> AppResult<()> {
    let mut clipboard = Clipboard::new().map_err(|error| AppError::Message(error.to_string()))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(())
}

fn expand_snippet_content(content: &str) -> AppResult<String> {
    let clipboard_text = Clipboard::new()
        .ok()
        .and_then(|mut clipboard| clipboard.get_text().ok())
        .unwrap_or_default();
    let date = Local::now().format("%Y-%m-%d").to_string();
    let time = Local::now().format("%H:%M:%S").to_string();
    let uuid = Uuid::new_v4().to_string();

    Ok(content
        .replace("{{date}}", &date)
        .replace("${date}", &date)
        .replace("{{time}}", &time)
        .replace("${time}", &time)
        .replace("{{clipboard}}", &clipboard_text)
        .replace("${clipboard}", &clipboard_text)
        .replace("{{uuid}}", &uuid)
        .replace("${uuid}", &uuid))
}

fn open_command_target(command: &str) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        StdCommand::new("cmd").args(["/C", command]).spawn()?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        StdCommand::new("sh").args(["-lc", command]).spawn()?;
    }
    Ok(())
}

fn reveal_in_folder(path: &str) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        StdCommand::new("open").args(["-R", path]).spawn()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        StdCommand::new("explorer")
            .args(["/select,", path])
            .spawn()?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        let parent = Path::new(path)
            .parent()
            .ok_or_else(|| AppError::from("Path has no parent directory"))?;
        opener::open(parent).map_err(|error| AppError::Message(error.to_string()))?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

fn open_in_terminal(path: &str) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        StdCommand::new("open")
            .args(["-a", "Terminal", path])
            .spawn()?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        StdCommand::new("cmd")
            .args(["/K", "cd", "/d", path])
            .spawn()?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        StdCommand::new("x-terminal-emulator")
            .args(["--working-directory", path])
            .spawn()
            .or_else(|_| {
                StdCommand::new("gnome-terminal")
                    .args(["--working-directory", path])
                    .spawn()
            })
            .map(|_| ())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

fn ensure_plugin_permission(state: &AppState, plugin_id: &str, permission: &str) -> AppResult<()> {
    let settings = state.db.get_settings()?;
    let granted = settings
        .plugins
        .granted_permissions
        .get(plugin_id)
        .cloned()
        .unwrap_or_default();

    if granted.iter().any(|entry| entry == permission) {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "Plugin {plugin_id} does not have permission {permission}."
        )))
    }
}

async fn run_shell_command(command: &str) -> AppResult<ShellCommandResult> {
    // TODO: Replace shell passthrough with a stricter command policy and argument model.
    #[cfg(target_os = "windows")]
    let output = TokioCommand::new("cmd")
        .args(["/C", command])
        .output()
        .await?;
    #[cfg(not(target_os = "windows"))]
    let output = TokioCommand::new("sh")
        .args(["-lc", command])
        .output()
        .await?;

    Ok(ShellCommandResult {
        exit_code: output.status.code().unwrap_or_default(),
        stdout: truncate_output(String::from_utf8_lossy(&output.stdout).trim()),
        stderr: truncate_output(String::from_utf8_lossy(&output.stderr).trim()),
    })
}

fn truncate_output(value: &str) -> String {
    value.chars().take(4000).collect()
}
