export type ResultItemType =
  | "app"
  | "file"
  | "folder"
  | "url"
  | "command"
  | "clipboard"
  | "snippet"
  | "plugin"
  | "workflow"
  | "system";

export type ResultSource =
  | "apps"
  | "files"
  | "web"
  | "clipboard"
  | "snippets"
  | "plugins"
  | "workflows"
  | "system";

export type LauncherMode = "search" | "actions" | "settings";

export type SearchScope =
  | "all"
  | "apps"
  | "files"
  | "clipboard"
  | "snippets"
  | "plugins"
  | "workflows"
  | "system";

export type ThemeMode = "system" | "light" | "dark";
export type LauncherLanguage = "system" | "en-US" | "zh-CN";

export type PluginPermission =
  | "network"
  | "filesystem.read"
  | "filesystem.write"
  | "clipboard.read"
  | "clipboard.write"
  | "shell.exec"
  | "notifications";

export type ClipboardContentType = "text" | "image" | "file";

export type ActionKind =
  | "launch-app"
  | "open-path"
  | "open-url"
  | "reveal-in-folder"
  | "copy-path"
  | "copy-text"
  | "open-in-terminal"
  | "search-web"
  | "paste-text"
  | "pin-clipboard-item"
  | "unpin-clipboard-item"
  | "delete-clipboard-item"
  | "clear-clipboard-history"
  | "expand-snippet"
  | "run-plugin-action"
  | "run-workflow"
  | "show-settings"
  | "rebuild-file-index"
  | "noop";

export interface ActionItem {
  id: string;
  title: string;
  kind: ActionKind;
  shortcut?: string;
  description?: string;
  requires?: PluginPermission[];
  payload?: Record<string, unknown>;
}

export interface ResultItem {
  id: string;
  title: string;
  subtitle?: string;
  type: ResultItemType;
  source: ResultSource;
  icon?: string;
  score: number;
  pluginId?: string;
  tags?: string[];
  actions: ActionItem[];
  payload: Record<string, unknown>;
}

export interface UsageStat {
  itemId: string;
  itemType: ResultItemType;
  query?: string;
  selectedCount: number;
  lastSelectedAt?: number;
}

export interface ClipboardItem {
  id: string;
  contentType: ClipboardContentType;
  text?: string | null;
  preview: string;
  pinned: boolean;
  createdAt: number;
  sourceApp?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SnippetRecord {
  id: string;
  name: string;
  trigger: string;
  content: string;
  enabled: boolean;
  scope?: string | null;
  appRestriction?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SnippetInput {
  id?: string;
  name: string;
  trigger: string;
  content: string;
  enabled: boolean;
  scope?: string | null;
  appRestriction?: string | null;
}

export interface SearchContext {
  query: string;
  normalizedQuery: string;
  now: number;
  scope: SearchScope;
  settings: LauncherSettings;
  usageByItemId: Record<string, UsageStat>;
  clipboardItems: ClipboardItem[];
  snippets: SnippetRecord[];
  workflows: WorkflowRecord[];
}

export interface SearchProvider {
  id: string;
  label: string;
  source: ResultSource;
  sourceWeight: number;
  timeoutMs?: number;
  search(query: string, context: SearchContext): Promise<ResultItem[]>;
  warmup?(): Promise<void>;
  dispose?(): Promise<void>;
}

export interface AppRecord {
  id: string;
  name: string;
  path: string;
  launchTarget?: string;
  launchTargetType?: "path" | "command";
  icon?: string | null;
  bundleId?: string | null;
  keywords?: string[];
}

export interface FileRecord {
  path: string;
  name: string;
  kind: "file" | "folder";
  extension?: string | null;
  mtimeMs: number;
}

export interface PluginCommandManifest {
  name: string;
  title: string;
  description?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  description?: string;
  commands: PluginCommandManifest[];
  permissions: PluginPermission[];
}

export type PluginRuntimeStatus =
  | "loading"
  | "ready"
  | "disabled"
  | "permission-required"
  | "timed-out"
  | "error";

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  rootPath: string;
  entryPath: string;
  entrySource: string;
  validationErrors: string[];
}

export interface PluginRuntimeSnapshot {
  pluginId: string;
  manifest: PluginManifest;
  status: PluginRuntimeStatus;
  grantedPermissions: PluginPermission[];
  missingPermissions: PluginPermission[];
  validationErrors: string[];
  lastError?: string;
  lastLoadedAt?: number;
}

export interface PluginPermissionRequest {
  pluginId: string;
  pluginName: string;
  permission: PluginPermission;
  reason: string;
  createdAt: number;
}

export interface LauncherSettings {
  hotkey: string;
  theme: ThemeMode;
  language: LauncherLanguage;
  indexPaths: string[];
  indexExclusions: string[];
  indexingPaused: boolean;
  search: {
    maxResults: number;
    sourceWeights: Record<ResultSource, number>;
  };
  clipboard: {
    maxItems: number;
    pollIntervalMs: number;
    privateApps: string[];
  };
  snippets: {
    enabledInSearch: boolean;
    enableExpansionHooks: boolean;
  };
  plugins: {
    enableHost: boolean;
    timeoutMs: number;
    promptOnFirstPermission: boolean;
    disabledPluginIds: string[];
    grantedPermissions: Record<string, PluginPermission[]>;
  };
  appearance: {
    denseMode: boolean;
    reduceMotion: boolean;
  };
  webSearch: {
    defaultEngine: string;
    shortcuts: Record<string, string>;
  };
}

export interface BootstrapPayload {
  settings: LauncherSettings;
  usageStats: UsageStat[];
  fileIndexStatus: FileIndexStatus;
  clipboardItems: ClipboardItem[];
  snippets: SnippetRecord[];
  plugins: DiscoveredPlugin[];
  workflows: WorkflowRecord[];
}

export interface FileIndexStatus {
  state: "idle" | "indexing" | "ready" | "error" | "stale" | "paused";
  indexedCount: number;
  indexedPaths: string[];
  excludedPaths: string[];
  lastIndexedAt?: number | null;
  message?: string | null;
  lastError?: string | null;
  paused: boolean;
  truncated: boolean;
  maxIndexedFiles: number;
}

export interface ActionRequest {
  action: ActionItem;
  result?: ResultItem;
}

export interface ActionResponse {
  ok: boolean;
  message?: string;
}

export type WorkflowTriggerType = "slash-command" | "keyword" | "hotkey" | "manual";

export type WorkflowNodeType =
  | "query-input"
  | "clipboard-input"
  | "file-input"
  | "static-value"
  | "http-request"
  | "invoke-workflow"
  | "template"
  | "regex-replace"
  | "conditional-branch"
  | "json-parse"
  | "json-extract"
  | "open-url"
  | "copy-to-clipboard"
  | "open-file"
  | "run-shell-command"
  | "invoke-shared-action"
  | "invoke-plugin-command"
  | "show-launcher-results"
  | "return-text"
  | "return-files"
  | "return-action-result"
  | "emit-toast";

export type WorkflowNodeStatus = "supported" | "planned";

export type WorkflowValueType =
  | "text"
  | "url"
  | "number"
  | "boolean"
  | "object"
  | "http-response"
  | "json"
  | "file"
  | "file-list"
  | "action-result"
  | "result-list"
  | "void";

export type WorkflowHttpMethod = "GET" | "POST";

export interface WorkflowHttpRequest {
  method: WorkflowHttpMethod;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  jsonBody?: unknown;
  timeoutMs?: number;
}

export interface WorkflowHttpResponse {
  url: string;
  status: number;
  ok: boolean;
  headers?: Record<string, string>;
  contentType?: string | null;
  text: string;
  json?: unknown;
}

export interface WorkflowTriggerBase {
  type: WorkflowTriggerType;
  label: string;
  enabled: boolean;
}

export interface WorkflowSlashCommandTrigger extends WorkflowTriggerBase {
  type: "slash-command";
  command: string;
  argumentName?: string;
  placeholder?: string;
}

export interface WorkflowKeywordTrigger extends WorkflowTriggerBase {
  type: "keyword";
  keyword: string;
  aliases?: string[];
  argumentName?: string;
  placeholder?: string;
}

export interface WorkflowHotkeyTrigger extends WorkflowTriggerBase {
  type: "hotkey";
  hotkey: string;
}

export interface WorkflowManualTrigger extends WorkflowTriggerBase {
  type: "manual";
}

export type WorkflowTrigger =
  | WorkflowSlashCommandTrigger
  | WorkflowKeywordTrigger
  | WorkflowHotkeyTrigger
  | WorkflowManualTrigger;

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowReusableInputDefinition {
  name: string;
  valueType: WorkflowValueType;
  required?: boolean;
  description?: string;
}

export interface WorkflowReusableOutputDefinition {
  name: string;
  valueType: WorkflowValueType;
  description?: string;
  valueTemplate: string;
}

export interface WorkflowReusableDefinition {
  description?: string;
  inputs: WorkflowReusableInputDefinition[];
  outputs: WorkflowReusableOutputDefinition[];
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  description?: string;
  status: WorkflowNodeStatus;
  config: Record<string, unknown>;
  position?: WorkflowNodePosition;
}

export interface WorkflowEdge {
  id: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toInput: string;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  builtIn: boolean;
  reusable?: WorkflowReusableDefinition | null;
  tags: string[];
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRunContext {
  workflowId: string;
  workflowName: string;
  triggerType: WorkflowTriggerType;
  invokedAt: number;
  query: string;
  rawInput: string;
  slashCommand?: string;
  argsText?: string;
  argsByName: Record<string, unknown>;
  launcherQuery: string;
  clipboardText?: string;
  files?: string[];
}

export interface WorkflowLogValuePreview {
  type: WorkflowValueType;
  summary: string;
}

export interface WorkflowExecutionLog {
  nodeId: string;
  nodeType: WorkflowNodeType;
  title: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  status: "success" | "error" | "skipped";
  inputPreview?: WorkflowLogValuePreview[];
  outputPreview?: WorkflowLogValuePreview;
  nestedLogs?: WorkflowExecutionLog[];
  error?: string;
}

export interface WorkflowValidationIssue {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
}

export interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  stars: number;
  tags: string[];
  updatedAt: string;
}

export interface WorkflowRunResult {
  ok: boolean;
  workflowId: string;
  logs: WorkflowExecutionLog[];
  validationIssues: WorkflowValidationIssue[];
  failureStage?: "validation" | "runtime";
  returnedText?: string;
  returnedFiles?: string[];
  actionResponse?: ActionResponse;
  resultItems?: ResultItem[];
  error?: string;
}
