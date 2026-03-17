import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { DEFAULT_SETTINGS, SearchEngine, parseQuery } from "@pulse/core";
import type {
  ActionItem,
  LauncherSettings,
  PluginPermission,
  ResultItem,
  SnippetInput,
  SnippetRecord
} from "@pulse/shared-types";

import { ActionPanel } from "./components/ActionPanel";
import { ResultList } from "./components/ResultList";
import { SettingsPanel } from "./components/SettingsPanel";
import { PluginHost } from "./features/plugins/plugin-host";
import {
  createProviders,
  getDefaultAction,
  getScopedInput
} from "./features/search/providers";
import { createLogger } from "./lib/logger";
import {
  bootstrapState,
  deleteSnippet as removeSnippetRecord,
  hideWindow,
  listClipboardItems,
  listSnippets,
  performAction,
  rebuildFileIndex,
  recordSelection,
  saveSnippet as persistSnippet,
  updateSettings as persistSettings
} from "./lib/backend";
import { useLauncherStore } from "./store/useLauncherStore";

const logger = createLogger("launcher");

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pluginHostRef = useRef<PluginHost | null>(null);
  const searchEngineRef = useRef<SearchEngine | null>(null);

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
    discoveredPlugins,
    pluginRuntime,
    pluginPermissionRequests,
    statusMessage,
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
    applySelection,
    setStatusMessage,
    setErrorMessage
  } = useLauncherStore();

  const deferredQuery = useDeferredValue(query);
  const currentSettings = settings ?? DEFAULT_SETTINGS;
  const selectedResult = results[selectedIndex];

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

        hydrate(payload);
        setDiscoveredPlugins(payload.plugins);
        pluginHostRef.current!.initialize(payload.plugins, payload.settings);
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

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setMode(mode === "settings" ? "search" : "settings");
        if (mode === "settings") {
          inputRef.current?.focus();
        }
        return;
      }

      if (event.key === "Escape" && mode === "settings") {
        event.preventDefault();
        setMode("search");
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [mode, setMode]);

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
            snippets
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

  async function refreshClipboardHistory() {
    const items = await listClipboardItems();
    setClipboardItems(items);
    return items;
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
        setMode("settings");
        setStatusMessage("Settings opened.");
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

      if (response.message) {
        setStatusMessage(response.message);
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
      const previousPaths = JSON.stringify(currentSettings.indexPaths);
      const saved = await persistSettings(nextSettings);
      setSettings(saved);
      pluginHostRef.current!.updateSettings(saved);
      setStatusMessage(
        previousPaths !== JSON.stringify(saved.indexPaths)
          ? "Settings saved. Rebuild the file index to apply directory changes."
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
      setStatusMessage(`Snippet ${saved.trigger} saved.`);
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
      setStatusMessage("Snippet deleted.");
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

  async function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (mode === "settings") {
      if (event.key === "Escape") {
        event.preventDefault();
        setMode("search");
      }
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

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      await executePrimaryResult(selectedResult);
      return;
    }

    if (event.key === "Tab") {
      const hasActions = (selectedResult?.actions.length ?? 0) > 0;
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

  return (
    <main className="min-h-screen px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-[36px] border border-white/8 bg-ink-900/80 px-5 py-5 shadow-halo backdrop-blur-2xl md:px-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-pulse-300/80">
                Pulse Launcher
              </div>
              <div className="mt-1 font-display text-3xl text-white">
                Keyboard-first local launcher
              </div>
            </div>
            <div className="hidden rounded-full border border-white/8 bg-white/5 px-3 py-2 font-mono text-xs text-slate-300 md:block">
              {currentSettings.hotkey}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/8 bg-black/25 px-4 py-4">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search apps, files, clipboard, snippets, plugins, or a web shortcut"
              className="w-full border-0 bg-transparent font-display text-2xl text-white outline-none placeholder:text-slate-500"
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <Hint>Tab actions</Hint>
              <Hint>Enter default action</Hint>
              <Hint>Ctrl+, settings</Hint>
              <Hint>`gh tauri` plugin</Hint>
              <Hint>&gt; pwd plugin</Hint>
              <Hint>`;standup` snippets</Hint>
            </div>
          </div>

          {mode === "settings" ? (
            <div className="mt-5">
              <SettingsPanel
                settings={currentSettings}
                snippets={snippets}
                fileIndexStatus={fileIndexStatus}
                clipboardCount={clipboardItems.length}
                plugins={pluginRuntime}
                permissionRequests={pluginPermissionRequests}
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
                onClose={() => setMode("search")}
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <ResultList
                  results={results}
                  selectedIndex={selectedIndex}
                  loading={loading}
                  onSelect={setSelectedIndex}
                  onExecute={(index) => {
                    void executePrimaryResult(results[index]);
                  }}
                />
              </div>

              <div className="space-y-4">
                {mode === "actions" && selectedResult ? (
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
                ) : null}

                <StatusCard
                  fileIndexStatus={fileIndexStatus?.state}
                  clipboardCount={clipboardItems.length}
                  snippetCount={snippets.length}
                  pluginCount={discoveredPlugins.length}
                  permissionRequestCount={pluginPermissionRequests.length}
                  statusMessage={statusMessage}
                  errorMessage={errorMessage}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5">
      {children}
    </div>
  );
}

function StatusCard({
  fileIndexStatus,
  clipboardCount,
  snippetCount,
  pluginCount,
  permissionRequestCount,
  statusMessage,
  errorMessage
}: {
  fileIndexStatus?: string;
  clipboardCount: number;
  snippetCount: number;
  pluginCount: number;
  permissionRequestCount: number;
  statusMessage?: string;
  errorMessage?: string;
}) {
  return (
    <section className="rounded-[28px] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
      <div className="text-xs uppercase tracking-[0.22em] text-pulse-300/80">Status</div>
      <div className="mt-3 space-y-2">
        <div>File index: {fileIndexStatus ?? "bootstrapping"}</div>
        <div>Clipboard items: {clipboardCount}</div>
        <div>Snippets: {snippetCount}</div>
        <div>Plugins: {pluginCount}</div>
        <div>Pending permission prompts: {permissionRequestCount}</div>
        <div>{statusMessage ?? "Ready. Use Tab for actions or Ctrl+, for settings."}</div>
        <div className="text-slate-400">
          Plugins run in isolated workers with host-side permission gates and timeouts.
        </div>
        {errorMessage ? <div className="text-rose-300">{errorMessage}</div> : null}
      </div>
    </section>
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
