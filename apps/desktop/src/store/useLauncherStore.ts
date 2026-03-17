import { create } from "zustand";

import type {
  BootstrapPayload,
  ClipboardItem,
  DiscoveredPlugin,
  FileIndexStatus,
  LauncherMode,
  LauncherSettings,
  PluginPermissionRequest,
  PluginRuntimeSnapshot,
  ResultItem,
  SnippetRecord,
  UsageStat
} from "@pulse/shared-types";

interface LauncherState {
  initialized: boolean;
  loading: boolean;
  mode: LauncherMode;
  query: string;
  results: ResultItem[];
  selectedIndex: number;
  actionIndex: number;
  settings: LauncherSettings | null;
  usageByItemId: Record<string, UsageStat>;
  fileIndexStatus: FileIndexStatus | null;
  clipboardItems: ClipboardItem[];
  snippets: SnippetRecord[];
  discoveredPlugins: DiscoveredPlugin[];
  pluginRuntime: PluginRuntimeSnapshot[];
  pluginPermissionRequests: PluginPermissionRequest[];
  statusMessage?: string;
  errorMessage?: string;
  hydrate(payload: BootstrapPayload): void;
  setLoading(value: boolean): void;
  setMode(mode: LauncherMode): void;
  setQuery(value: string): void;
  setResults(results: ResultItem[]): void;
  setSelectedIndex(index: number): void;
  setActionIndex(index: number): void;
  moveSelection(delta: number): void;
  moveActionSelection(delta: number): void;
  setSettings(settings: LauncherSettings): void;
  setFileIndexStatus(status: FileIndexStatus): void;
  setClipboardItems(items: ClipboardItem[]): void;
  setSnippets(snippets: SnippetRecord[]): void;
  setDiscoveredPlugins(plugins: DiscoveredPlugin[]): void;
  setPluginRuntime(pluginRuntime: PluginRuntimeSnapshot[]): void;
  setPluginPermissionRequests(requests: PluginPermissionRequest[]): void;
  applySelection(itemId: string, itemType: ResultItem["type"], query: string): void;
  setStatusMessage(message?: string): void;
  setErrorMessage(message?: string): void;
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  initialized: false,
  loading: false,
  mode: "search",
  query: "",
  results: [],
  selectedIndex: 0,
  actionIndex: 0,
  settings: null,
  usageByItemId: {},
  fileIndexStatus: null,
  clipboardItems: [],
  snippets: [],
  discoveredPlugins: [],
  pluginRuntime: [],
  pluginPermissionRequests: [],
  hydrate(payload) {
    set({
      initialized: true,
      settings: payload.settings,
      usageByItemId: Object.fromEntries(
        payload.usageStats.map((entry) => [entry.itemId, entry])
      ),
      fileIndexStatus: payload.fileIndexStatus,
      clipboardItems: payload.clipboardItems,
      snippets: payload.snippets,
      discoveredPlugins: payload.plugins
    });
  },
  setLoading(value) {
    set({ loading: value });
  },
  setMode(mode) {
    set({ mode, actionIndex: 0 });
  },
  setQuery(value) {
    set({ query: value, selectedIndex: 0, actionIndex: 0 });
  },
  setResults(results) {
    set({
      results,
      selectedIndex:
        results.length === 0
          ? 0
          : Math.min(get().selectedIndex, Math.max(results.length - 1, 0))
    });
  },
  setSelectedIndex(index) {
    set({ selectedIndex: index });
  },
  setActionIndex(index) {
    set({ actionIndex: index });
  },
  moveSelection(delta) {
    const { results, selectedIndex } = get();
    if (results.length === 0) {
      return;
    }

    const next = (selectedIndex + delta + results.length) % results.length;
    set({ selectedIndex: next });
  },
  moveActionSelection(delta) {
    const currentResult = get().results[get().selectedIndex];
    const count = currentResult?.actions.length ?? 0;
    if (count === 0) {
      return;
    }

    const next = (get().actionIndex + delta + count) % count;
    set({ actionIndex: next });
  },
  setSettings(settings) {
    set({ settings });
  },
  setFileIndexStatus(status) {
    set({ fileIndexStatus: status });
  },
  setClipboardItems(items) {
    set({ clipboardItems: items });
  },
  setSnippets(snippets) {
    set({ snippets });
  },
  setDiscoveredPlugins(plugins) {
    set({ discoveredPlugins: plugins });
  },
  setPluginRuntime(pluginRuntime) {
    set({ pluginRuntime });
  },
  setPluginPermissionRequests(requests) {
    set({ pluginPermissionRequests: requests });
  },
  applySelection(itemId, itemType, query) {
    const current = get().usageByItemId[itemId];
    set({
      usageByItemId: {
        ...get().usageByItemId,
        [itemId]: {
          itemId,
          itemType,
          query,
          selectedCount: (current?.selectedCount ?? 0) + 1,
          lastSelectedAt: Date.now()
        }
      }
    });
  },
  setStatusMessage(message) {
    set({ statusMessage: message });
  },
  setErrorMessage(message) {
    set({ errorMessage: message });
  }
}));
