use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub launch_target: Option<String>,
    pub launch_target_type: Option<String>,
    pub icon: Option<String>,
    pub bundle_id: Option<String>,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub extension: Option<String>,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCommandManifest {
    pub name: String,
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub entry: String,
    pub description: Option<String>,
    pub commands: Vec<PluginCommandManifest>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredPlugin {
    pub manifest: PluginManifest,
    pub root_path: String,
    pub entry_path: String,
    pub entry_source: String,
    pub validation_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItem {
    pub id: String,
    pub content_type: String,
    pub text: Option<String>,
    pub preview: String,
    pub pinned: bool,
    pub created_at: i64,
    pub source_app: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetRecord {
    pub id: String,
    pub name: String,
    pub trigger: String,
    pub content: String,
    pub enabled: bool,
    pub scope: Option<String>,
    pub app_restriction: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetInput {
    pub id: Option<String>,
    pub name: String,
    pub trigger: String,
    pub content: String,
    pub enabled: bool,
    pub scope: Option<String>,
    pub app_restriction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTrigger {
    #[serde(rename = "type")]
    pub trigger_type: String,
    pub label: String,
    pub enabled: bool,
    pub command: Option<String>,
    pub argument_name: Option<String>,
    pub placeholder: Option<String>,
    pub keyword: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub hotkey: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNode {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub status: String,
    pub description: Option<String>,
    pub config: serde_json::Value,
    pub position: Option<WorkflowNodePosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEdge {
    pub id: String,
    pub from_node_id: String,
    pub from_port: String,
    pub to_node_id: String,
    pub to_input: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowReusableInputDefinition {
    pub name: String,
    pub value_type: String,
    pub required: Option<bool>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowReusableOutputDefinition {
    pub name: String,
    pub value_type: String,
    pub description: Option<String>,
    pub value_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowReusableDefinition {
    pub description: Option<String>,
    pub inputs: Vec<WorkflowReusableInputDefinition>,
    pub outputs: Vec<WorkflowReusableOutputDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub built_in: bool,
    pub reusable: Option<WorkflowReusableDefinition>,
    pub tags: Vec<String>,
    pub trigger: WorkflowTrigger,
    pub nodes: Vec<WorkflowNode>,
    pub edges: Vec<WorkflowEdge>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FileIndexStatus {
    pub state: String,
    pub indexed_count: usize,
    pub indexed_paths: Vec<String>,
    pub excluded_paths: Vec<String>,
    pub last_indexed_at: Option<i64>,
    pub message: Option<String>,
    pub last_error: Option<String>,
    pub paused: bool,
    pub truncated: bool,
    pub max_indexed_files: usize,
}

impl Default for FileIndexStatus {
    fn default() -> Self {
        Self {
            state: "idle".to_string(),
            indexed_count: 0,
            indexed_paths: Vec::new(),
            excluded_paths: Vec::new(),
            last_indexed_at: None,
            message: None,
            last_error: None,
            paused: false,
            truncated: false,
            max_indexed_files: 15_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchSettings {
    pub max_results: usize,
    pub source_weights: HashMap<String, f64>,
}

impl Default for SearchSettings {
    fn default() -> Self {
        let mut source_weights = HashMap::new();
        source_weights.insert("apps".to_string(), 1.2);
        source_weights.insert("files".to_string(), 1.0);
        source_weights.insert("web".to_string(), 0.75);
        source_weights.insert("clipboard".to_string(), 0.95);
        source_weights.insert("snippets".to_string(), 1.02);
        source_weights.insert("plugins".to_string(), 0.9);
        source_weights.insert("workflows".to_string(), 1.06);
        source_weights.insert("system".to_string(), 0.85);

        Self {
            max_results: 9,
            source_weights,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ClipboardSettings {
    pub max_items: usize,
    pub poll_interval_ms: u64,
    pub private_apps: Vec<String>,
}

impl Default for ClipboardSettings {
    fn default() -> Self {
        Self {
            max_items: 80,
            poll_interval_ms: 1200,
            private_apps: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SnippetSettings {
    pub enabled_in_search: bool,
    pub enable_expansion_hooks: bool,
}

impl Default for SnippetSettings {
    fn default() -> Self {
        Self {
            enabled_in_search: true,
            enable_expansion_hooks: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PluginSettings {
    pub enable_host: bool,
    pub timeout_ms: u64,
    pub prompt_on_first_permission: bool,
    pub disabled_plugin_ids: Vec<String>,
    pub granted_permissions: HashMap<String, Vec<String>>,
}

impl Default for PluginSettings {
    fn default() -> Self {
        Self {
            enable_host: true,
            timeout_ms: 1200,
            prompt_on_first_permission: true,
            disabled_plugin_ids: Vec::new(),
            granted_permissions: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub dense_mode: bool,
    pub reduce_motion: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            dense_mode: false,
            reduce_motion: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct WebSearchSettings {
    pub default_engine: String,
    pub shortcuts: HashMap<String, String>,
}

impl Default for WebSearchSettings {
    fn default() -> Self {
        let mut shortcuts = HashMap::new();
        shortcuts.insert(
            "g".to_string(),
            "https://www.google.com/search?q={query}".to_string(),
        );
        shortcuts.insert(
            "ddg".to_string(),
            "https://duckduckgo.com/?q={query}".to_string(),
        );
        shortcuts.insert(
            "maps".to_string(),
            "https://www.google.com/maps/search/{query}".to_string(),
        );

        Self {
            default_engine: "https://www.google.com/search?q={query}".to_string(),
            shortcuts,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct LauncherSettings {
    pub hotkey: String,
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    pub index_paths: Vec<String>,
    pub index_exclusions: Vec<String>,
    pub indexing_paused: bool,
    pub search: SearchSettings,
    pub clipboard: ClipboardSettings,
    pub snippets: SnippetSettings,
    pub plugins: PluginSettings,
    pub appearance: AppearanceSettings,
    pub web_search: WebSearchSettings,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Space".to_string(),
            theme: "dark".to_string(),
            language: default_language(),
            index_paths: Vec::new(),
            index_exclusions: Vec::new(),
            indexing_paused: false,
            search: SearchSettings::default(),
            clipboard: ClipboardSettings::default(),
            snippets: SnippetSettings::default(),
            plugins: PluginSettings::default(),
            appearance: AppearanceSettings::default(),
            web_search: WebSearchSettings::default(),
        }
    }
}

fn default_language() -> String {
    "system".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStat {
    pub item_id: String,
    pub item_type: String,
    pub query: Option<String>,
    pub selected_count: i64,
    pub last_selected_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub stars: u64,
    pub tags: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub settings: LauncherSettings,
    pub usage_stats: Vec<UsageStat>,
    pub file_index_status: FileIndexStatus,
    pub clipboard_items: Vec<ClipboardItem>,
    pub snippets: Vec<SnippetRecord>,
    pub plugins: Vec<DiscoveredPlugin>,
    pub workflows: Vec<WorkflowRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellCommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowHttpRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
    pub json_body: Option<serde_json::Value>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowHttpResponse {
    pub url: String,
    pub status: u16,
    pub ok: bool,
    pub headers: Option<HashMap<String, String>>,
    pub content_type: Option<String>,
    pub text: String,
    pub json: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionItem {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub shortcut: Option<String>,
    pub description: Option<String>,
    pub requires: Option<Vec<String>>,
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultItem {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub r#type: String,
    pub source: String,
    pub icon: Option<String>,
    pub score: f64,
    pub plugin_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub actions: Vec<ActionItem>,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResponse {
    pub ok: bool,
    pub message: Option<String>,
}
