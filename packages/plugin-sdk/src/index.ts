import type {
  ActionItem,
  ActionResponse,
  LauncherSettings,
  PluginCommandManifest,
  PluginManifest,
  PluginPermission,
  ResultItemType
} from "@pulse/shared-types";

export interface PluginSearchContext {
  query: string;
  normalizedQuery: string;
  now: number;
  commands: PluginCommandManifest[];
  permissions: PluginPermission[];
  settings: LauncherSettings;
}

export interface PluginActionContext {
  now: number;
  settings: LauncherSettings;
  permissions: PluginPermission[];
}

export interface PluginApi {
  fetchJson<T = unknown>(
    url: string,
    init?: {
      method?: "GET" | "POST";
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<T>;
  execShell(command: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
  readClipboardText(): Promise<string>;
  writeClipboardText(text: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  showNotification(title: string, body?: string): Promise<void>;
}

export interface PluginSearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type?: ResultItemType;
  score?: number;
  payload?: Record<string, unknown>;
  actions?: ActionItem[];
  tags?: string[];
}

export interface LauncherPluginModule {
  manifest?: PluginManifest;
  search?(context: PluginSearchContext, api: PluginApi): Promise<PluginSearchResult[]>;
  runAction?(
    actionId: string,
    payload: Record<string, unknown>,
    context: PluginActionContext,
    api: PluginApi
  ): Promise<ActionResponse | void>;
  dispose?(): Promise<void>;
}

export function definePlugin<TPlugin extends LauncherPluginModule>(
  plugin: TPlugin
): TPlugin {
  return plugin;
}
