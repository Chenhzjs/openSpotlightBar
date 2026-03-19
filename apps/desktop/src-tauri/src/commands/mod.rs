use std::{net::ToSocketAddrs, path::Path, process::Command as StdCommand, time::Duration};

use arboard::Clipboard;
use chrono::Local;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE},
    Client, Method,
};
use serde_json::Value;
use tauri::{AppHandle, Manager, PhysicalPosition, State, WebviewWindow};
use tokio::process::Command as TokioCommand;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{
        ActionItem, ActionResponse, AppRecord, BootstrapPayload, ClipboardItem, FileIndexStatus,
        FileRecord, LauncherSettings, MarketplaceEntry, MarketplaceRegistry, ResultItem,
        ShellCommandResult, SnippetInput, SnippetRecord, WorkflowHttpRequest,
        WorkflowHttpResponse, WorkflowRecord,
    },
    services::{file_index, plugins},
    state::AppState,
    update_hotkey,
};

#[tauri::command]
pub async fn resize_window(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    use tauri::LogicalSize;

    #[cfg(target_os = "macos")]
    {
        use tauri::utils::config::WindowEffectsConfig;
        use tauri::window::Effect;
        let _ = window.set_effects(WindowEffectsConfig {
            effects: vec![Effect::UnderWindowBackground],
            state: None,
            radius: Some(30.0),
            color: None,
        });
    }

    window
        .set_size(tauri::Size::Logical(LogicalSize { width, height }))
        .map_err(|e| e.to_string())?;
    center_window_for_size(&window, width, height)?;
    Ok(())
}

fn center_window_for_size(
    window: &WebviewWindow,
    logical_width: f64,
    logical_height: f64,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window.primary_monitor().map_err(|error| error.to_string())?);

    let Some(monitor) = monitor else {
        return window.center().map_err(|error| error.to_string());
    };

    let work_area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = (logical_width * scale).round() as i32;
    let height = (logical_height * scale).round() as i32;
    let x = work_area.position.x + ((work_area.size.width as i32 - width) / 2);
    let y = work_area.position.y + ((work_area.size.height as i32 - height) / 2);

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

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
        .search_files(&query, 64)
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
pub async fn list_workflows(state: State<'_, AppState>) -> Result<Vec<WorkflowRecord>, String> {
    state.db.list_workflows().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_workflow(
    workflow: WorkflowRecord,
    state: State<'_, AppState>,
) -> Result<WorkflowRecord, String> {
    state
        .db
        .save_workflow(&workflow)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_workflow(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .delete_workflow(&id)
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

    if previous.index_paths != settings.index_paths
        || previous.index_exclusions != settings.index_exclusions
        || previous.indexing_paused != settings.indexing_paused
    {
        let previous_status = state
            .file_index_status
            .lock()
            .map_err(|error| error.to_string())?
            .clone();
        let indexed_count = state
            .db
            .count_indexed_files()
            .map_err(|error| error.to_string())?;
        let next_status = file_index::reconcile_status(&settings, indexed_count, Some(previous_status));
        state
            .db
            .save_file_index_status(&next_status)
            .map_err(|error| error.to_string())?;
        if let Ok(mut guard) = state.file_index_status.lock() {
            *guard = next_status;
        }
    }

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
pub async fn workflow_exec_shell(
    command: String,
    state: State<'_, AppState>,
) -> Result<ShellCommandResult, String> {
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
    .map_err(|_| format!("Workflow shell command timed out after {timeout_ms}ms"))?
    .map_err(|error| error.to_string())?;

    Ok(output)
}

const MAX_RESPONSE_BODY_BYTES: usize = 5 * 1024 * 1024; // 5 MB

fn validate_workflow_url(url: &reqwest::Url) -> Result<(), String> {
    match url.scheme() {
        "http" | "https" => {}
        other => return Err(format!("Unsupported URL scheme: {other}")),
    }

    let host = url
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    let blocked_hosts = [
        "localhost",
        "metadata.google.internal",
        "169.254.169.254",
    ];
    if blocked_hosts.iter().any(|&h| host.eq_ignore_ascii_case(h)) {
        return Err(format!("Blocked internal host: {host}"));
    }

    let port = url.port_or_known_default().unwrap_or(80);
    let addr_str = format!("{host}:{port}");
    if let Ok(addrs) = addr_str.to_socket_addrs() {
        for addr in addrs {
            if is_private_ip(&addr.ip()) {
                return Err(format!("Blocked private/internal IP: {}", addr.ip()));
            }
        }
    }

    Ok(())
}

fn is_private_ip(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.octets()[0] == 169 && v4.octets()[1] == 254
        }
        std::net::IpAddr::V6(v6) => v6.is_loopback(),
    }
}

#[tauri::command]
pub async fn workflow_http_request(
    request: WorkflowHttpRequest,
    state: State<'_, AppState>,
) -> Result<WorkflowHttpResponse, String> {
    let settings_timeout_ms = state
        .db
        .get_settings()
        .map_err(|error| error.to_string())?
        .plugins
        .timeout_ms
        .max(500);

    let timeout_ms = request.timeout_ms.unwrap_or(settings_timeout_ms).max(200);
    let client = Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| error.to_string())?;

    let method = match request.method.to_uppercase().as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        other => return Err(format!("Unsupported workflow HTTP method: {other}")),
    };

    let mut url = reqwest::Url::parse(&request.url)
        .map_err(|error| format!("Invalid workflow request URL: {error}"))?;
    for (key, value) in &request.query_params {
        url.query_pairs_mut().append_pair(key, value);
    }

    validate_workflow_url(&url)?;

    let mut headers = HeaderMap::new();
    for (key, value) in &request.headers {
        let header_name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|error| format!("Invalid workflow header name '{key}': {error}"))?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|error| format!("Invalid workflow header value for '{key}': {error}"))?;
        headers.insert(header_name, header_value);
    }

    let mut builder = client.request(method, url.clone()).headers(headers);
    if let Some(json_body) = &request.json_body {
        builder = builder.header(CONTENT_TYPE, "application/json");
        builder = builder.json(json_body);
    }

    let response = builder.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|header_value| (name.to_string(), header_value.to_string()))
        })
        .collect::<std::collections::HashMap<_, _>>();
    let body_bytes = response
        .bytes()
        .await
        .map_err(|error| error.to_string())?;
    if body_bytes.len() > MAX_RESPONSE_BODY_BYTES {
        return Err(format!(
            "Response body exceeds {}MB limit",
            MAX_RESPONSE_BODY_BYTES / (1024 * 1024)
        ));
    }
    let text = String::from_utf8_lossy(&body_bytes).to_string();
    let json = if content_type
        .as_deref()
        .map(|value| value.to_ascii_lowercase().contains("json"))
        .unwrap_or(false)
        || text.trim_start().starts_with('{')
        || text.trim_start().starts_with('[')
    {
        serde_json::from_str::<serde_json::Value>(&text).ok()
    } else {
        None
    };

    Ok(WorkflowHttpResponse {
        url: final_url,
        status: status.as_u16(),
        ok: status.is_success(),
        headers: Some(headers),
        content_type,
        text,
        json,
    })
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

#[tauri::command]
pub async fn open_devtools(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window was not found".to_string())?;
    window.open_devtools();
    Ok(())
}

const DEFAULT_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/openSpotlightBar/plugin-registry/main/registry.json";

#[tauri::command]
pub async fn fetch_plugin_registry() -> Result<Vec<MarketplaceEntry>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(DEFAULT_REGISTRY_URL)
        .send()
        .await
        .map_err(|error| format!("Failed to fetch plugin registry: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Registry returned status {}",
            response.status()
        ));
    }

    let registry: MarketplaceRegistry = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse registry JSON: {error}"))?;

    Ok(registry.plugins)
}

#[tauri::command]
pub async fn install_marketplace_plugin(
    app: AppHandle,
    repo_url: String,
    plugin_id: String,
) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let target_path = app_dir.join("plugins").join(&plugin_id);

    if target_path.exists() {
        return Err(format!("Plugin {plugin_id} is already installed."));
    }

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!("Failed to create plugins directory: {error}")
        })?;
    }

    let output = TokioCommand::new("git")
        .args([
            "clone",
            "--depth",
            "1",
            &repo_url,
            &target_path.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|error| format!("Failed to run git clone: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(&target_path);
        return Err(format!("git clone failed: {stderr}"));
    }

    let manifest_path = target_path.join("manifest.json");
    if !manifest_path.exists() {
        let _ = std::fs::remove_dir_all(&target_path);
        return Err("Cloned repository does not contain a manifest.json.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn uninstall_marketplace_plugin(
    app: AppHandle,
    plugin_id: String,
) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let target_path = app_dir.join("plugins").join(&plugin_id);

    if !target_path.exists() {
        return Err(format!("Plugin {plugin_id} is not installed."));
    }

    std::fs::remove_dir_all(&target_path).map_err(|error| {
        format!("Failed to remove plugin directory: {error}")
    })?;

    Ok(())
}

pub(crate) fn execute_action(
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
    let parts: Vec<&str> = command.split_whitespace().collect();
    let program = parts
        .first()
        .ok_or_else(|| AppError::Message("Empty command target".to_string()))?;
    let args = &parts[1..];

    StdCommand::new(program).args(args).spawn()?;
    Ok(())
}

fn validate_fs_path(path: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::Message("Path must not be empty".to_string()));
    }
    if path.contains('\0') {
        return Err(AppError::Message("Path contains null bytes".to_string()));
    }
    if !Path::new(path).exists() {
        return Err(AppError::Message(format!("Path does not exist: {path}")));
    }
    Ok(())
}

fn reveal_in_folder(path: &str) -> AppResult<()> {
    validate_fs_path(path)?;
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
    validate_fs_path(path)?;
    if !Path::new(path).is_dir() {
        return Err(AppError::Message(format!(
            "Path is not a directory: {path}"
        )));
    }
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

fn validate_shell_command(command: &str) -> AppResult<()> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message("Shell command must not be empty".to_string()));
    }
    if trimmed.len() > 2048 {
        return Err(AppError::Message(
            "Shell command exceeds maximum length of 2048 characters".to_string(),
        ));
    }
    Ok(())
}

async fn run_shell_command(command: &str) -> AppResult<ShellCommandResult> {
    validate_shell_command(command)?;

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
