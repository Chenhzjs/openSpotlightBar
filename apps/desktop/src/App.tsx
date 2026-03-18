import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent
} from "react";

import {
  DEFAULT_SETTINGS,
  SearchEngine,
  getBuiltInWorkflows,
  parseQuery
} from "@pulse/core";
import type {
  ActionItem,
  FileIndexStatus,
  LauncherSettings,
  PluginPermission,
  ResultItem,
  SearchScope,
  SnippetInput,
  SnippetRecord,
  WorkflowRecord
} from "@pulse/shared-types";

import { ActionPanel } from "./components/ActionPanel";
import { ConfigHub } from "./components/ConfigHub";
import { ResultList } from "./components/ResultList";
import { SettingsPanel } from "./components/SettingsPanel";
import { WorkflowStudioPanel } from "./components/WorkflowStudioPanel";
import type { ConfigSection } from "./features/commands/config-command";
import {
  CONFIG_HUB_SECTIONS,
  parseConfigCommand
} from "./features/commands/config-command";
import { PluginHost } from "./features/plugins/plugin-host";
import {
  createProviders,
  getDefaultAction,
  getScopedInput
} from "./features/search/providers";
import {
  findWorkflowById,
  getWorkflowResultSummary,
  runWorkflowInLauncher
} from "./features/workflows/runner";
import { createLogger } from "./lib/logger";
import {
  bootstrapState,
  deleteWorkflow as removeWorkflowRecord,
  deleteSnippet as removeSnippetRecord,
  getFileIndexStatus,
  hideWindow,
  listClipboardItems,
  listSnippets,
  saveWorkflow as persistWorkflow,
  performAction,
  rebuildFileIndex,
  recordSelection,
  resizeWindow,
  saveSnippet as persistSnippet,
  updateSettings as persistSettings
} from "./lib/backend";
import { detectPlatformShell, getPlatformGlyph } from "./lib/platform-shell";
import { useLauncherStore } from "./store/useLauncherStore";

const logger = createLogger("launcher");

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pluginHostRef = useRef<PluginHost | null>(null);
  const searchEngineRef = useRef<SearchEngine | null>(null);
  const [settingsSection, setSettingsSection] = useState<ConfigSection>("general");
  const [settingsSurface, setSettingsSurface] = useState<"hub" | "detail">("hub");
  const [platformShell] = useState(() => detectPlatformShell());

  if (!pluginHostRef.current) {
    pluginHostRef.current = new PluginHost(DEFAULT_SETTINGS, logger);
  }

  if (!searchEngineRef.current) {
    searchEngineRef.current = new SearchEngine(createProviders(pluginHostRef.current), {
      providerTimeoutMs: 900,
      logger
    });
  }

  const {
    initialized,
    loading,
    mode,
    query,
    results,
    selectedIndex,
    actionIndex,
    settings,
    usageByItemId,
    fileIndexStatus,
    clipboardItems,
    snippets,
    workflows,
    workflowRuns,
    pluginRuntime,
    pluginPermissionRequests,
    errorMessage,
    hydrate,
    setLoading,
    setMode,
    setQuery,
    setResults,
    moveSelection,
    moveActionSelection,
    setSelectedIndex,
    setActionIndex,
    setSettings,
    setFileIndexStatus,
    setClipboardItems,
    setSnippets,
    setDiscoveredPlugins,
    setPluginRuntime,
    setPluginPermissionRequests,
    appendWorkflowRun,
    upsertWorkflow,
    removeWorkflow,
    applySelection,
    setStatusMessage,
    setErrorMessage
  } = useLauncherStore();

  const deferredQuery = useDeferredValue(query);
  const currentSettings = settings ?? DEFAULT_SETTINGS;
  const useChineseCopy =
    currentSettings.language === "zh-CN" ||
    (currentSettings.language === "system" &&
      typeof navigator !== "undefined" &&
      navigator.language.toLowerCase().startsWith("zh"));
  const selectedResult = results[selectedIndex];
  const trimmedQuery = query.trim();
  const parsedSearchQuery = parseQuery(query);
  const configCommand = parseConfigCommand(query);
  const isConfigHub = mode === "settings" && settingsSurface === "hub";
  const isSettingsDetail = mode === "settings" && settingsSurface === "detail";
  const showSearchResults =
    mode === "search" && !configCommand && (trimmedQuery.length > 0 || loading);
  const showErrorPanel = mode === "search" && !configCommand && !!errorMessage;
  const canNavigateResults = showSearchResults && results.length > 0;
  const launcherGlyph = getPlatformGlyph(platformShell);
  const resultListEmptyState = getSearchEmptyState(parsedSearchQuery.scope, fileIndexStatus);
  const hasContentBelow =
    isConfigHub ||
    isSettingsDetail ||
    (mode === "actions" && !!selectedResult) ||
    showSearchResults ||
    showErrorPanel;

  function openConfigHub(section: ConfigSection = "general") {
    setSettingsSection(section);
    setSettingsSurface("hub");
    setMode("settings");
  }

  function openSettingsDetail(section: ConfigSection = settingsSection) {
    setSettingsSection(section);
    setSettingsSurface("detail");
    setMode("settings");
  }

  function closeSettingsHub() {
    if (parseConfigCommand(query)) {
      setQuery("");
    }
    setSettingsSurface("hub");
    setMode("search");
    inputRef.current?.focus();
  }

  function closeSettingsDetail() {
    setSettingsSurface("hub");
    setMode("settings");
    inputRef.current?.focus();
  }

  useEffect(() => {
    const unsubscribe = pluginHostRef.current!.subscribe(
      ({ snapshots, permissionRequests }) => {
        setPluginRuntime(snapshots);
        setPluginPermissionRequests(permissionRequests);
      }
    );

    return unsubscribe;
  }, [setPluginPermissionRequests, setPluginRuntime]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const payload = await bootstrapState();
        if (cancelled) {
          return;
        }

        const seededWorkflows = await ensureWorkflowCatalog(payload.workflows);
        if (cancelled) {
          return;
        }

        const hydratedPayload = {
          ...payload,
          workflows: seededWorkflows
        };

        hydrate(hydratedPayload);
        setDiscoveredPlugins(hydratedPayload.plugins);
        pluginHostRef.current!.initialize(
          hydratedPayload.plugins,
          hydratedPayload.settings
        );
        await searchEngineRef.current?.warmup();
        inputRef.current?.focus();
      } catch (error) {
        logger.error("Bootstrap failed.", {
          error: error instanceof Error ? error.message : String(error)
        });
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to bootstrap Pulse Launcher."
          );
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [hydrate, setDiscoveredPlugins, setErrorMessage]);

  async function ensureWorkflowCatalog(
    existingWorkflows: WorkflowRecord[]
  ): Promise<WorkflowRecord[]> {
    const builtIns = getBuiltInWorkflows();
    const existingById = new Map(existingWorkflows.map((workflow) => [workflow.id, workflow]));
    const missing = builtIns.filter((workflow) => !existingById.has(workflow.id));

    if (missing.length === 0) {
      return existingWorkflows;
    }

    const saved = await Promise.all(missing.map((workflow) => persistWorkflow(workflow)));
    return [...existingWorkflows, ...saved].sort(
      (left, right) =>
        Number(right.builtIn) - Number(left.builtIn) || right.updatedAt - left.updatedAt
    );
  }

  useEffect(() => {
    if (configCommand) {
      setSettingsSection(configCommand.section);
      return;
    }

    if (mode !== "settings") {
      setSettingsSurface("hub");
    }
  }, [configCommand, mode]);

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        if (mode === "settings") {
          if (parseConfigCommand(query)) {
            setQuery("");
          }
          setSettingsSurface("hub");
          setMode("search");
          inputRef.current?.focus();
        } else {
          setSettingsSection("general");
          setSettingsSurface("hub");
          setMode("settings");
        }
        return;
      }

      if (event.key === "Escape" && mode === "settings") {
        event.preventDefault();
        if (settingsSurface === "detail") {
          setSettingsSurface("hub");
          setMode("settings");
          inputRef.current?.focus();
        } else {
          if (parseConfigCommand(query)) {
            setQuery("");
          }
          setSettingsSurface("hub");
          setMode("search");
          inputRef.current?.focus();
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [mode, query, settingsSurface, setMode, setQuery]);

  useEffect(() => {
    if (!initialized || mode === "settings") {
      return;
    }

    let active = true;

    async function runSearch() {
      const parsed = parseQuery(deferredQuery);
      setLoading(true);
      setErrorMessage(undefined);

      try {
        const nextResults = await searchEngineRef.current!.search(
          getScopedInput(deferredQuery),
          {
            query: parsed.raw,
            normalizedQuery: parsed.normalized,
            now: Date.now(),
            scope: parsed.scope,
            settings: currentSettings,
            usageByItemId,
            clipboardItems,
            snippets,
            workflows
          }
        );

        if (!active) {
          return;
        }

        startTransition(() => {
          setResults(nextResults);
        });
      } catch (error) {
        logger.warn("Search pipeline failed.", {
          error: error instanceof Error ? error.message : String(error),
          query: deferredQuery
        });
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Search failed.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void runSearch();

    return () => {
      active = false;
    };
  }, [
    initialized,
    mode,
    deferredQuery,
    currentSettings,
    usageByItemId,
    clipboardItems,
    snippets,
    workflows,
    setErrorMessage,
    setLoading,
    setResults
  ]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    let cancelled = false;

    async function refreshClipboard() {
      try {
        const items = await listClipboardItems();
        if (!cancelled) {
          setClipboardItems(items);
        }
      } catch (error) {
        logger.warn("Clipboard refresh failed.", {
          error: error instanceof Error ? error.message : String(error)
        });
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to refresh clipboard history."
          );
        }
      }
    }

    void refreshClipboard();

    const handle = window.setInterval(
      () => {
        void refreshClipboard();
      },
      Math.max(currentSettings.clipboard.pollIntervalMs, 500)
    );

    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [
    initialized,
    currentSettings.clipboard.pollIntervalMs,
    setClipboardItems,
    setErrorMessage
  ]);

  useEffect(() => {
    if (mode === "search") {
      inputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let active = true;
    let cleanup: (() => void) | undefined;

    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        if (!active) {
          return;
        }
        const appWindow = getCurrentWindow();
        cleanup = await appWindow.onFocusChanged(({ payload: focused }) => {
          if (!focused && mode !== "settings") {
            void hideWindow();
          }
        });
      })
      .catch((error) => {
        logger.warn("Window focus listener failed.", {
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      active = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [mode]);

  // Unified: measure content + resize window via Rust command (no async import issues)
  const lastAppliedSize = useRef({ w: 0, h: 0 });
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    const main = surfaceRef.current;
    if (!main) {
      return;
    }

    const MAX_WINDOW_HEIGHT = isSettingsDetail ? 760 : 560;
    const nextWidth = isSettingsDetail ? 1120 : mode === "settings" ? 980 : 900;

    function measure(): number {
      const barEl = main!.firstElementChild;
      const barHeight = barEl ? barEl.getBoundingClientRect().height : 72;
      const contentEl = contentRef.current;
      if (!contentEl) {
        return barHeight;
      }
      return barHeight + 4 + contentEl.scrollHeight;
    }

    function scheduleResize() {
      if (resizeTimer.current) {
        clearTimeout(resizeTimer.current);
      }
      resizeTimer.current = setTimeout(() => {
        const naturalHeight = measure();
        const windowHeight = Math.min(Math.ceil(naturalHeight), MAX_WINDOW_HEIGHT);

        if (lastAppliedSize.current.w === nextWidth && lastAppliedSize.current.h === windowHeight) {
          return;
        }
        lastAppliedSize.current = { w: nextWidth, h: windowHeight };

        void resizeWindow(nextWidth, windowHeight);
      }, 30);
    }

    // Initial resize
    scheduleResize();

    // Watch for dynamic content changes
    let observer: ResizeObserver | undefined;
    const contentEl = contentRef.current;
    if (contentEl && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        scheduleResize();
      });
      observer.observe(contentEl);
    }

    return () => {
      if (resizeTimer.current) {
        clearTimeout(resizeTimer.current);
      }
      observer?.disconnect();
    };
  }, [
    isConfigHub,
    isSettingsDetail,
    mode,
    platformShell,
    results.length,
    showErrorPanel,
    showSearchResults,
    hasContentBelow
  ]);

  async function refreshClipboardHistory() {
    const items = await listClipboardItems();
    setClipboardItems(items);
    return items;
  }

  async function searchLauncherQuery(rawSearch: string) {
    const parsed = parseQuery(rawSearch);
    return searchEngineRef.current!.search(getScopedInput(rawSearch), {
      query: parsed.raw,
      normalizedQuery: parsed.normalized,
      now: Date.now(),
      scope: parsed.scope,
      settings: currentSettings,
      usageByItemId,
      clipboardItems,
      snippets,
      workflows
    });
  }

  async function refreshSnippetRecords() {
    const nextSnippets = await listSnippets();
    setSnippets(nextSnippets);
    return nextSnippets;
  }

  async function executeAction(
    action: ActionItem,
    result?: ResultItem,
    options?: { preserveMode?: boolean }
  ) {
    setErrorMessage(undefined);
    setStatusMessage(undefined);

    try {
      if (action.kind === "show-settings") {
        openConfigHub("general");
        return;
      }

      if (action.kind === "run-workflow") {
        const workflowId =
          typeof action.payload?.workflowId === "string"
            ? action.payload.workflowId
            : typeof result?.payload.workflowId === "string"
              ? result.payload.workflowId
              : undefined;
        const rawWorkflowQuery =
          typeof action.payload?.rawQuery === "string"
            ? action.payload.rawQuery
            : typeof result?.payload.rawQuery === "string"
              ? result.payload.rawQuery
              : query;

        if (!workflowId) {
          throw new Error("Workflow action is missing a workflow id.");
        }

        const workflow = findWorkflowById(workflows, workflowId);
        if (!workflow) {
          throw new Error("Workflow was not found.");
        }

        const run = await runWorkflowInLauncher({
          workflow,
          rawQuery: rawWorkflowQuery,
          settings: currentSettings,
          usageByItemId,
          clipboardItems,
          snippets,
          workflows,
          pluginHost: pluginHostRef.current!,
          onFileIndexStatusChange: setFileIndexStatus,
          searchLauncher: searchLauncherQuery,
          emitToast: (message) => {
            setStatusMessage(message);
          }
        });

        appendWorkflowRun(workflow.id, run);

        if (result) {
          applySelection(result.id, result.type, rawWorkflowQuery);
          await recordSelection(result.id, result.type, rawWorkflowQuery);
        }

        const summary = getWorkflowResultSummary(run);
        if (run.ok) {
          if (run.resultItems?.length) {
            setResults(run.resultItems);
          }
          setStatusMessage(summary ?? `${workflow.name} completed.`);
          await refreshClipboardHistory();
          if (!options?.preserveMode) {
            setMode("search");
          }
        } else {
          throw new Error(summary ?? "Workflow execution failed.");
        }
        return;
      }

      if (action.kind === "rebuild-file-index") {
        const status = await rebuildFileIndex();
        setFileIndexStatus(status);
        setStatusMessage(status.message ?? "File index rebuilt.");
        if (!options?.preserveMode) {
          setMode("search");
        }
        return;
      }

      let response;
      if (action.kind === "run-plugin-action" && result) {
        response = await pluginHostRef.current!.runAction(
          action,
          result,
          currentSettings
        );
      } else {
        response = await performAction(action, result);
      }

      if (!response.ok) {
        throw new Error(response.message ?? "Action failed.");
      }

      if (needsClipboardRefresh(action.kind)) {
        await refreshClipboardHistory();
      }

      if (result) {
        applySelection(result.id, result.type, query);
        await recordSelection(result.id, result.type, query);
      }

      if (!options?.preserveMode) {
        setMode("search");
      }
    } catch (error) {
      logger.warn("Action execution failed.", {
        actionKind: action.kind,
        error: error instanceof Error ? error.message : String(error)
      });
      setErrorMessage(error instanceof Error ? error.message : "Action failed.");
    }
  }

  async function executePrimaryResult(result?: ResultItem) {
    const action = getDefaultAction(result);
    if (!result || !action) {
      return;
    }

    await executeAction(action, result);
  }

  async function saveSettings(nextSettings: LauncherSettings) {
    try {
      const previousIndexConfig = JSON.stringify({
        paths: currentSettings.indexPaths,
        exclusions: currentSettings.indexExclusions,
        paused: currentSettings.indexingPaused
      });
      const saved = await persistSettings(nextSettings);
      const nextStatus = await getFileIndexStatus();
      setSettings(saved);
      setFileIndexStatus(nextStatus);
      pluginHostRef.current!.updateSettings(saved);
      setStatusMessage(
        previousIndexConfig !==
          JSON.stringify({
            paths: saved.indexPaths,
            exclusions: saved.indexExclusions,
            paused: saved.indexingPaused
          })
          ? saved.indexingPaused
            ? "Settings saved. Indexing is paused until you resume it."
            : "Settings saved. Rebuild the file index to apply directory and exclusion changes."
          : "Settings saved."
      );
    } catch (error) {
      logger.warn("Settings save failed.", {
        error: error instanceof Error ? error.message : String(error)
      });
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save settings."
      );
      throw error;
    }
  }

  async function saveSnippet(snippet: SnippetInput): Promise<SnippetRecord> {
    try {
      const saved = await persistSnippet(snippet);
      await refreshSnippetRecords();
      return saved;
    } catch (error) {
      logger.warn("Snippet save failed.", {
        error: error instanceof Error ? error.message : String(error)
      });
      setErrorMessage(error instanceof Error ? error.message : "Failed to save snippet.");
      throw error;
    }
  }

  async function deleteSnippet(id: string) {
    try {
      await removeSnippetRecord(id);
      await refreshSnippetRecords();
    } catch (error) {
      logger.warn("Snippet delete failed.", {
        error: error instanceof Error ? error.message : String(error)
      });
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete snippet."
      );
      throw error;
    }
  }

  async function saveWorkflow(workflow: WorkflowRecord): Promise<WorkflowRecord> {
    try {
      const saved = await persistWorkflow(workflow);
      upsertWorkflow(saved);
      setStatusMessage(saved.builtIn ? "Built-in workflow refreshed." : "Workflow saved.");
      return saved;
    } catch (error) {
      logger.warn("Workflow save failed.", {
        error: error instanceof Error ? error.message : String(error),
        workflowId: workflow.id
      });
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save workflow."
      );
      throw error;
    }
  }

  async function deleteWorkflow(id: string) {
    try {
      await removeWorkflowRecord(id);
      removeWorkflow(id);
      setStatusMessage("Workflow deleted.");
    } catch (error) {
      logger.warn("Workflow delete failed.", {
        error: error instanceof Error ? error.message : String(error),
        workflowId: id
      });
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete workflow."
      );
      throw error;
    }
  }

  async function duplicateWorkflow(workflow: WorkflowRecord): Promise<WorkflowRecord> {
    const now = Date.now();
    const duplicated: WorkflowRecord = {
      ...workflow,
      id: `workflow-${now.toString(36)}`,
      name: `${workflow.name} Copy`,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
      trigger:
        workflow.trigger.type === "slash-command"
          ? {
              ...workflow.trigger,
              command: `${workflow.trigger.command}-copy`,
              label: `${workflow.trigger.command}-copy`
            }
          : workflow.trigger
    };

    return saveWorkflow(duplicated);
  }

  async function clearClipboardHistory() {
    await executeAction(
      {
        id: "settings:clear-clipboard-history",
        title: "Clear clipboard history",
        kind: "clear-clipboard-history"
      },
      undefined,
      { preserveMode: true }
    );
  }

  async function grantPluginPermission(pluginId: string, permission: PluginPermission) {
    const granted = new Set(currentSettings.plugins.grantedPermissions[pluginId] ?? []);
    granted.add(permission);

    await saveSettings({
      ...currentSettings,
      plugins: {
        ...currentSettings.plugins,
        grantedPermissions: {
          ...currentSettings.plugins.grantedPermissions,
          [pluginId]: [...granted]
        }
      }
    });
    pluginHostRef.current!.dismissPermissionRequest(pluginId, permission);
  }

  async function revokePluginPermission(pluginId: string, permission: PluginPermission) {
    const remaining = (currentSettings.plugins.grantedPermissions[pluginId] ?? []).filter(
      (entry) => entry !== permission
    );

    await saveSettings({
      ...currentSettings,
      plugins: {
        ...currentSettings.plugins,
        grantedPermissions: {
          ...currentSettings.plugins.grantedPermissions,
          [pluginId]: remaining
        }
      }
    });
  }

  async function togglePluginEnabled(pluginId: string, enabled: boolean) {
    const disabledIds = new Set(currentSettings.plugins.disabledPluginIds);
    if (enabled) {
      disabledIds.delete(pluginId);
    } else {
      disabledIds.add(pluginId);
    }

    await saveSettings({
      ...currentSettings,
      plugins: {
        ...currentSettings.plugins,
        disabledPluginIds: [...disabledIds]
      }
    });
  }

  function dismissPluginPermissionRequest(
    pluginId: string,
    permission: PluginPermission
  ) {
    pluginHostRef.current!.dismissPermissionRequest(pluginId, permission);
  }

  async function runWorkflowFromStudio(
    workflow: WorkflowRecord,
    rawInput: string
  ) {
    setErrorMessage(undefined);
    setStatusMessage(undefined);

    try {
      const run = await runWorkflowInLauncher({
        workflow,
        rawQuery: rawInput,
        settings: currentSettings,
        usageByItemId,
        clipboardItems,
        snippets,
        workflows,
        pluginHost: pluginHostRef.current!,
        onFileIndexStatusChange: setFileIndexStatus,
        searchLauncher: searchLauncherQuery,
        emitToast: (message) => {
          setStatusMessage(message);
        }
      });

      appendWorkflowRun(workflow.id, run);
      const summary = getWorkflowResultSummary(run);

      if (run.ok) {
        setStatusMessage(summary ?? `${workflow.name} completed.`);
        await refreshClipboardHistory();
      } else {
        setErrorMessage(summary ?? "Workflow execution failed.");
      }

      return run;
    } catch (error) {
      logger.warn("Workflow studio run failed.", {
        workflowId: workflow.id,
        error: error instanceof Error ? error.message : String(error)
      });
      setErrorMessage(
        error instanceof Error ? error.message : "Workflow execution failed."
      );
      throw error;
    }
  }

  async function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (mode === "settings") {
      if (settingsSurface === "hub") {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveHubSelection(1);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveHubSelection(-1);
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          openSettingsDetail(settingsSection);
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (settingsSurface === "detail") {
          closeSettingsDetail();
        } else {
          closeSettingsHub();
        }
      }
      return;
    }

    if (configCommand && event.key === "Enter") {
      event.preventDefault();
      openConfigHub(configCommand.section);
      return;
    }

    if (mode === "actions") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActionSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActionSelection(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const action = selectedResult?.actions[actionIndex];
        if (action) {
          await executeAction(action, selectedResult);
        }
      } else if (event.key === "Tab" || event.key === "Escape") {
        event.preventDefault();
        setMode("search");
      }
      return;
    }

    if (event.key === "ArrowDown" && canNavigateResults) {
      event.preventDefault();
      moveSelection(1);
      return;
    }

    if (event.key === "ArrowUp" && canNavigateResults) {
      event.preventDefault();
      moveSelection(-1);
      return;
    }

    if (event.key === "Enter" && canNavigateResults) {
      event.preventDefault();
      await executePrimaryResult(selectedResult);
      return;
    }

    if (event.key === "Tab") {
      const hasActions = canNavigateResults && (selectedResult?.actions.length ?? 0) > 0;
      if (hasActions) {
        event.preventDefault();
        setActionIndex(0);
        setMode("actions");
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      await hideWindow();
    }
  }

  function moveHubSelection(delta: number) {
    const currentIndex = CONFIG_HUB_SECTIONS.indexOf(
      settingsSection as (typeof CONFIG_HUB_SECTIONS)[number]
    );
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeIndex + delta + CONFIG_HUB_SECTIONS.length) % CONFIG_HUB_SECTIONS.length;
    setSettingsSection(CONFIG_HUB_SECTIONS[nextIndex]);
  }

  const contentPanel = isConfigHub ? (
    <ConfigHub
      selectedSection={settingsSection}
      stats={{
        indexedFiles: fileIndexStatus?.indexedCount ?? 0,
        clipboardItems: clipboardItems.length,
        snippets: snippets.length,
        plugins: pluginRuntime.length,
        pendingPermissions: pluginPermissionRequests.length
      }}
      onSelect={setSettingsSection}
      onOpen={openSettingsDetail}
      onClose={closeSettingsHub}
    />
  ) : isSettingsDetail ? (
    settingsSection === "workflow" ? (
      <WorkflowStudioPanel
        workflows={workflows}
        workflowRuns={workflowRuns}
        snippets={snippets.length}
        plugins={pluginRuntime.length}
        indexedFiles={fileIndexStatus?.indexedCount ?? 0}
        onSaveWorkflow={saveWorkflow}
        onDeleteWorkflow={deleteWorkflow}
        onDuplicateWorkflow={duplicateWorkflow}
        onRunWorkflow={runWorkflowFromStudio}
        onBack={closeSettingsDetail}
      />
    ) : (
    <SettingsPanel
      settings={currentSettings}
      snippets={snippets}
      fileIndexStatus={fileIndexStatus}
      clipboardCount={clipboardItems.length}
      plugins={pluginRuntime}
      permissionRequests={pluginPermissionRequests}
      initialSection={settingsSection}
      onSaveSettings={saveSettings}
      onRebuildIndex={async () => {
        await executeAction(
          {
            id: "settings:rebuild-file-index",
            title: "Rebuild file index",
            kind: "rebuild-file-index"
          },
          undefined,
          { preserveMode: true }
        );
      }}
      onSaveSnippet={saveSnippet}
      onDeleteSnippet={deleteSnippet}
      onClearClipboard={clearClipboardHistory}
      onGrantPluginPermission={grantPluginPermission}
      onRevokePluginPermission={revokePluginPermission}
      onDismissPluginPermissionRequest={dismissPluginPermissionRequest}
      onTogglePluginEnabled={togglePluginEnabled}
      onClose={closeSettingsDetail}
    />
    )
  ) : mode === "actions" && selectedResult ? (
    <ActionPanel
      result={selectedResult}
      selectedIndex={actionIndex}
      onSelect={setActionIndex}
      onExecute={(index) => {
        const action = selectedResult.actions[index];
        if (action) {
          void executeAction(action, selectedResult);
        }
      }}
      onClose={() => setMode("search")}
    />
  ) : showSearchResults ? (
    <ResultList
      results={results}
      selectedIndex={selectedIndex}
      loading={loading}
      emptyTitle={resultListEmptyState.title}
      emptyDetail={resultListEmptyState.detail}
      loadingLabel={resultListEmptyState.loadingLabel}
      onSelect={setSelectedIndex}
      onExecute={(index) => {
        void executePrimaryResult(results[index]);
      }}
    />
  ) : showErrorPanel ? (
    <div className="shell-panel rounded-[24px] border border-rose-300/20 px-4 py-3 text-sm text-rose-200">
      {errorMessage}
    </div>
  ) : null;

  return (
    <main
      ref={surfaceRef}
      className={`platform-shell platform-${platformShell} flex max-h-screen flex-col bg-transparent p-0 text-[color:var(--shell-text-primary)]`}
    >
      <div className="shell-bar shrink-0 rounded-[30px]">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] text-sm text-[color:var(--shell-text-secondary)]">
            {launcherGlyph}
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              useChineseCopy ? "搜索内容或输入 /config" : "Search or type /config"
            }
            className="w-full border-0 bg-transparent text-[1.6rem] font-medium tracking-[-0.03em] text-[color:var(--shell-text-primary)] outline-none placeholder:text-[color:var(--shell-text-muted)]"
          />
        </div>
      </div>

      {hasContentBelow && (
        <div ref={contentRef} className="scrollbar-hidden mt-1 min-h-0 flex-1 overflow-y-auto">
          {contentPanel}
        </div>
      )}
    </main>
  );
}

function needsClipboardRefresh(kind: ActionItem["kind"]): boolean {
  return (
    kind === "copy-text" ||
    kind === "copy-path" ||
    kind === "paste-text" ||
    kind === "pin-clipboard-item" ||
    kind === "unpin-clipboard-item" ||
    kind === "delete-clipboard-item" ||
    kind === "clear-clipboard-history" ||
    kind === "expand-snippet"
  );
}

function getSearchEmptyState(
  scope: SearchScope,
  fileIndexStatus: FileIndexStatus | null
): {
  title: string;
  detail?: string;
  loadingLabel?: string;
} {
  if (scope !== "files") {
    return {
      title: "No matching results.",
      detail: "Try a different query, or use /config to review provider settings.",
      loadingLabel: "Searching launcher sources..."
    };
  }

  switch (fileIndexStatus?.state) {
    case "indexing":
      return {
        title: "File index is rebuilding.",
        detail:
          fileIndexStatus.message ??
          "Search is using lightweight filename and path data while indexing continues.",
        loadingLabel: "Searching indexed files while rebuild runs..."
      };
    case "paused":
      return {
        title: "File indexing is paused.",
        detail:
          "Resume indexing in /config indexing, then rebuild to refresh file results.",
        loadingLabel: "Searching the existing file index..."
      };
    case "error":
      return {
        title: "File index needs attention.",
        detail:
          fileIndexStatus.lastError ??
          fileIndexStatus.message ??
          "Rebuild the file index from /config indexing.",
        loadingLabel: "Searching the last available file index..."
      };
    case "stale":
      return {
        title: "No indexed file matched this query.",
        detail:
          fileIndexStatus.message ??
          "The index settings changed. Rebuild from /config indexing to refresh file results.",
        loadingLabel: "Searching the existing file index..."
      };
    default:
      if ((fileIndexStatus?.indexedCount ?? 0) === 0) {
        return {
          title: "No indexed files yet.",
          detail:
            "Add directories in /config indexing and rebuild to create the lightweight file index.",
          loadingLabel: "Preparing file search..."
        };
      }

      return {
        title: "No indexed file matched this query.",
        detail:
          "Try a filename, folder name, or path fragment. The file index stays lightweight and local.",
        loadingLabel: "Searching indexed files..."
      };
  }
}
