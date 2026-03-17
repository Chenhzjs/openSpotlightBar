export type ResultItemType =
  | "app"
  | "file"
  | "folder"
  | "url"
  | "command"
  | "clipboard"
  | "snippet"
  | "plugin"
  | "system";

export type ResultSource =
  | "apps"
  | "files"
  | "web"
  | "clipboard"
  | "snippets"
  | "plugins"
  | "system";

export type LauncherMode = "search" | "actions" | "settings";

export type SearchScope =
  | "all"
  | "apps"
  | "files"
  | "clipboard"
  | "snippets"
  | "plugins"
  | "system";

export type ThemeMode = "system" | "light" | "dark";

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
  indexPaths: string[];
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
}

export interface FileIndexStatus {
  state: "idle" | "indexing" | "ready" | "error";
  indexedCount: number;
  lastIndexedAt?: number | null;
  message?: string | null;
}

export interface ActionRequest {
  action: ActionItem;
  result?: ResultItem;
}

export interface ActionResponse {
  ok: boolean;
  message?: string;
}
