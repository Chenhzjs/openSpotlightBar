use std::{
    env,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    commands::execute_action,
    db::Database,
    error::{AppError, AppResult},
    models::{
        ActionItem, ActionResponse, ClipboardItem, LauncherSettings, PluginManifest, ResultItem,
        SnippetRecord, UsageStat, WorkflowRecord,
    },
    state::AppState,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeShellBootstrap {
    pub settings: LauncherSettings,
    pub usage_stats: Vec<UsageStat>,
    pub clipboard_items: Vec<ClipboardItem>,
    pub snippets: Vec<SnippetRecord>,
    pub indexed_file_count: usize,
    pub plugins: Vec<NativePluginSummary>,
    pub workflows: Vec<NativeWorkflowSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeWorkflowSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: String,
    pub trigger_label: String,
    pub enabled: bool,
    pub built_in: bool,
    pub reusable: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionRequest {
    action: ActionItem,
    result: Option<ResultItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordSelectionRequest {
    item_id: String,
    item_type: String,
    query: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePluginSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub permissions: Vec<String>,
    pub validation_errors: Vec<String>,
}

pub fn run_cli() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("bootstrap") => print_json(&bootstrap()?),
        Some("update-language") => {
            let language = args
                .next()
                .ok_or_else(|| "Expected language value.".to_string())?;
            print_json(&update_language(&language)?)
        }
        Some("update-settings") => {
            let settings: LauncherSettings = read_json_from_stdin()?;
            print_json(&update_settings(settings)?)
        }
        Some("search-files") => {
            let query = args.collect::<Vec<_>>().join(" ");
            print_json(&search_files(&query)?)
        }
        Some("perform-action") => {
            let request: ActionRequest = read_json_from_stdin()?;
            print_json(&perform_action(request)?)
        }
        Some("record-selection") => {
            let request: RecordSelectionRequest = read_json_from_stdin()?;
            print_json(&record_selection(request)?)
        }
        Some(other) => Err(format!("Unsupported bridge command: {other}").into()),
        None => Err("Expected bridge command.".into()),
    }
}

fn print_json<T: Serialize>(value: &T) -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", serde_json::to_string(value)?);
    Ok(())
}

fn read_json_from_stdin<T: for<'de> Deserialize<'de>>() -> Result<T, Box<dyn std::error::Error>> {
    let mut buffer = String::new();
    io::stdin().read_to_string(&mut buffer)?;
    Ok(serde_json::from_str(&buffer)?)
}

fn bootstrap() -> AppResult<NativeShellBootstrap> {
    let database = Database::new(&resolve_app_data_dir()?)?;
    build_bootstrap(&database)
}

fn update_language(language: &str) -> AppResult<NativeShellBootstrap> {
    let database = Database::new(&resolve_app_data_dir()?)?;
    let mut settings = database.get_settings()?;
    settings.language = normalize_language(language);
    database.save_settings(&settings)?;
    build_bootstrap(&database)
}

fn update_settings(settings: LauncherSettings) -> AppResult<NativeShellBootstrap> {
    let database = Database::new(&resolve_app_data_dir()?)?;
    database.save_settings(&settings)?;
    build_bootstrap(&database)
}

fn build_bootstrap(database: &Database) -> AppResult<NativeShellBootstrap> {
    Ok(NativeShellBootstrap {
        settings: database.get_settings()?,
        usage_stats: database.list_usage_stats()?,
        clipboard_items: database.list_clipboard_items()?,
        snippets: database.list_snippets()?,
        indexed_file_count: database.count_indexed_files()?,
        plugins: discover_plugins()?,
        workflows: database
            .list_workflows()?
            .into_iter()
            .map(to_workflow_summary)
            .collect(),
    })
}

fn normalize_language(language: &str) -> String {
    match language.trim().to_ascii_lowercase().as_str() {
        "zh-cn" | "zh" => "zh-CN".to_string(),
        "en-us" | "en" => "en-US".to_string(),
        _ => "system".to_string(),
    }
}

fn search_files(query: &str) -> AppResult<Vec<ResultItem>> {
    let trimmed = query.trim();
    if trimmed.len() < 2 {
        return Ok(Vec::new());
    }

    let database = Database::new(&resolve_app_data_dir()?)?;
    let files = database.search_files(trimmed, 24)?;
    Ok(files.into_iter().map(to_file_result).collect())
}

fn perform_action(request: ActionRequest) -> AppResult<ActionResponse> {
    let database = Arc::new(Database::new(&resolve_app_data_dir()?)?);
    let settings = database.get_settings()?;
    let state = AppState::new(database, settings.hotkey);
    execute_action(&request.action, request.result.as_ref(), &state)
}

fn record_selection(request: RecordSelectionRequest) -> AppResult<ActionResponse> {
    let database = Database::new(&resolve_app_data_dir()?)?;
    database.record_selection(&request.item_id, &request.item_type, &request.query)?;
    Ok(ActionResponse {
        ok: true,
        message: None,
    })
}

fn resolve_app_data_dir() -> AppResult<PathBuf> {
    let project_dirs = ProjectDirs::from("com", "pulse", "launcher")
        .ok_or_else(|| AppError::from("Unable to resolve application data directory"))?;
    Ok(project_dirs.data_dir().to_path_buf())
}

fn discover_plugins() -> AppResult<Vec<NativePluginSummary>> {
    let mut plugins = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for root in candidate_plugin_roots()? {
        if !root.exists() {
            continue;
        }

        let entries = match fs::read_dir(root) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let plugin_dir = entry.path();
            if !plugin_dir.is_dir() {
                continue;
            }

            if let Some(plugin) = load_plugin_summary(&plugin_dir)? {
                if seen_ids.insert(plugin.id.clone()) {
                    plugins.push(plugin);
                }
            }
        }
    }

    plugins.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(plugins)
}

fn candidate_plugin_roots() -> AppResult<Vec<PathBuf>> {
    let mut roots = Vec::new();

    roots.push(resolve_app_data_dir()?.join("plugins"));

    if let Ok(current_dir) = env::current_dir() {
        roots.push(current_dir.join("plugins"));
    }

    Ok(roots)
}

fn load_plugin_summary(plugin_dir: &Path) -> AppResult<Option<NativePluginSummary>> {
    let manifest_path = plugin_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Ok(None);
    }

    let manifest_raw = match fs::read_to_string(&manifest_path) {
        Ok(raw) => raw,
        Err(_) => return Ok(None),
    };

    let manifest: PluginManifest = match serde_json::from_str(&manifest_raw) {
        Ok(manifest) => manifest,
        Err(_) => return Ok(None),
    };

    let validation_errors = validate_plugin_manifest(&manifest);

    Ok(Some(NativePluginSummary {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        permissions: manifest.permissions,
        validation_errors,
    }))
}

fn validate_plugin_manifest(manifest: &PluginManifest) -> Vec<String> {
    let mut errors = Vec::new();

    if manifest.id.trim().is_empty() {
        errors.push("Plugin id must not be empty.".to_string());
    }
    if manifest.name.trim().is_empty() {
        errors.push("Plugin name must not be empty.".to_string());
    }
    if manifest.version.trim().is_empty() {
        errors.push("Plugin version must not be empty.".to_string());
    }
    if manifest.entry.trim().is_empty() {
        errors.push("Plugin entry must not be empty.".to_string());
    }

    errors
}

fn to_file_result(file: crate::models::FileRecord) -> ResultItem {
    let relative_time = format_relative_time(file.mtime_ms);

    ResultItem {
        id: format!("file:{}", file.path),
        title: file.name,
        subtitle: Some(file.path.clone()),
        r#type: file.kind.clone(),
        source: "files".to_string(),
        icon: None,
        score: file_base_score(file.mtime_ms, &file.kind),
        plugin_id: None,
        tags: None,
        actions: vec![
            ActionItem {
                id: "open-path".to_string(),
                title: "Open".to_string(),
                kind: "open-path".to_string(),
                shortcut: Some("Enter".to_string()),
                description: None,
                requires: None,
                payload: Some(json!({ "path": file.path })),
            },
            ActionItem {
                id: "reveal-in-folder".to_string(),
                title: "Reveal in folder".to_string(),
                kind: "reveal-in-folder".to_string(),
                shortcut: None,
                description: None,
                requires: None,
                payload: Some(json!({ "path": file.path })),
            },
            ActionItem {
                id: "copy-path".to_string(),
                title: "Copy path".to_string(),
                kind: "copy-path".to_string(),
                shortcut: None,
                description: None,
                requires: None,
                payload: Some(json!({ "path": file.path })),
            },
            ActionItem {
                id: "open-in-terminal".to_string(),
                title: "Open in terminal".to_string(),
                kind: "open-in-terminal".to_string(),
                shortcut: None,
                description: None,
                requires: None,
                payload: Some(json!({ "path": file.path })),
            },
        ],
        payload: json!({
            "path": file.path,
            "kind": file.kind,
            "mtimeMs": file.mtime_ms,
            "relativeTime": relative_time
        }),
    }
}

fn to_workflow_summary(workflow: WorkflowRecord) -> NativeWorkflowSummary {
    let trigger_label = workflow.trigger.command.or(workflow.trigger.keyword).or(workflow.trigger.hotkey).unwrap_or(workflow.trigger.label);

    NativeWorkflowSummary {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        trigger_type: workflow.trigger.trigger_type,
        trigger_label,
        enabled: workflow.enabled && workflow.trigger.enabled,
        built_in: workflow.built_in,
        reusable: workflow.reusable.is_some(),
    }
}

fn file_base_score(timestamp_ms: i64, kind: &str) -> f64 {
    let age_hours = ((SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
        - timestamp_ms)
        .max(0) as f64)
        / 3_600_000.0;
    let recency_boost = if age_hours < 6.0 {
        0.16
    } else if age_hours < 24.0 {
        0.1
    } else if age_hours < 24.0 * 7.0 {
        0.05
    } else if age_hours < 24.0 * 30.0 {
        0.02
    } else {
        0.0
    };

    if kind == "folder" {
        0.8 + recency_boost
    } else {
        0.82 + recency_boost
    }
}

fn format_relative_time(timestamp_ms: i64) -> String {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let delta_ms = (now_ms - timestamp_ms).max(0);
    let minutes = delta_ms / 60_000;

    if minutes < 1 {
        return "just now".to_string();
    }
    if minutes < 60 {
        return format!("{minutes}m ago");
    }

    let hours = minutes / 60;
    if hours < 24 {
        return format!("{hours}h ago");
    }

    format!("{}d ago", hours / 24)
}
