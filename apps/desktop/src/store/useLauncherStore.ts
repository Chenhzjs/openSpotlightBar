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
  UsageStat,
  WorkflowRecord,
  WorkflowRunResult
} from "@osb/shared-types";

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
  workflows: WorkflowRecord[];
  discoveredPlugins: DiscoveredPlugin[];
  pluginRuntime: PluginRuntimeSnapshot[];
  pluginPermissionRequests: PluginPermissionRequest[];
  workflowRuns: Record<string, WorkflowRunResult[]>;
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
  setWorkflows(workflows: WorkflowRecord[]): void;
  upsertWorkflow(workflow: WorkflowRecord): void;
  removeWorkflow(id: string): void;
  setDiscoveredPlugins(plugins: DiscoveredPlugin[]): void;
  setPluginRuntime(pluginRuntime: PluginRuntimeSnapshot[]): void;
  setPluginPermissionRequests(requests: PluginPermissionRequest[]): void;
  appendWorkflowRun(workflowId: string, run: WorkflowRunResult): void;
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
  workflows: [],
  discoveredPlugins: [],
  pluginRuntime: [],
  pluginPermissionRequests: [],
  workflowRuns: {},
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
      workflows: payload.workflows,
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
  setWorkflows(workflows) {
    set({ workflows });
  },
  upsertWorkflow(workflow) {
    set({
      workflows: [
        workflow,
        ...get().workflows.filter((entry) => entry.id !== workflow.id)
      ].sort(
        (left, right) =>
          Number(right.builtIn) - Number(left.builtIn) || right.updatedAt - left.updatedAt
      )
    });
  },
  removeWorkflow(id) {
    set({
      workflows: get().workflows.filter((entry) => entry.id !== id),
      workflowRuns: Object.fromEntries(
        Object.entries(get().workflowRuns).filter(([workflowId]) => workflowId !== id)
      )
    });
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
  appendWorkflowRun(workflowId, run) {
    const current = get().workflowRuns[workflowId] ?? [];
    set({
      workflowRuns: {
        ...get().workflowRuns,
        [workflowId]: [run, ...current].slice(0, 12)
      }
    });
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
