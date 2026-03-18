import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";

import type {
  FileIndexStatus,
  LauncherSettings,
  PluginPermission,
  PluginPermissionRequest,
  PluginRuntimeSnapshot,
  ResultSource,
  SnippetInput,
  SnippetRecord
} from "@pulse/shared-types";

import type { ConfigSection } from "../features/commands/config-command";

interface SettingsPanelProps {
  settings: LauncherSettings;
  snippets: SnippetRecord[];
  fileIndexStatus?: FileIndexStatus | null;
  clipboardCount: number;
  plugins: PluginRuntimeSnapshot[];
  permissionRequests: PluginPermissionRequest[];
  initialSection?: ConfigSection;
  onSaveSettings(settings: LauncherSettings): Promise<void>;
  onRebuildIndex(): Promise<void>;
  onSaveSnippet(snippet: SnippetInput): Promise<SnippetRecord>;
  onDeleteSnippet(id: string): Promise<void>;
  onClearClipboard(): Promise<void>;
  onGrantPluginPermission(pluginId: string, permission: PluginPermission): Promise<void>;
  onRevokePluginPermission(pluginId: string, permission: PluginPermission): Promise<void>;
  onDismissPluginPermissionRequest(pluginId: string, permission: PluginPermission): void;
  onTogglePluginEnabled(pluginId: string, enabled: boolean): Promise<void>;
  onClose(): void;
}

interface SnippetFormState {
  id?: string;
  name: string;
  trigger: string;
  content: string;
  enabled: boolean;
  scope: string;
  appRestriction: string;
}

const SOURCE_WEIGHT_FIELDS: ResultSource[] = [
  "apps",
  "files",
  "web",
  "clipboard",
  "snippets",
  "plugins",
  "workflows",
  "system"
];

const SETTINGS_SECTIONS: Array<{
  id: ConfigSection;
  label: string;
  command: string;
  description: string;
}> = [
  {
    id: "general",
    label: "General",
    command: "/config",
    description: "Launcher defaults and hotkey scaffolding."
  },
  {
    id: "search",
    label: "Search",
    command: "/config search",
    description: "Provider weights, result limits, and scope hints."
  },
  {
    id: "clipboard",
    label: "Clipboard",
    command: "/config clipboard",
    description: "Local clipboard retention and privacy scaffolding."
  },
  {
    id: "indexing",
    label: "Indexing",
    command: "/config indexing",
    description: "Directory roots for lightweight file search."
  },
  {
    id: "snippets",
    label: "Snippets",
    command: "/config snippets",
    description: "Snippet CRUD and expansion settings."
  },
  {
    id: "plugins",
    label: "Plugins",
    command: "/config plugins",
    description: "Plugin host state, permissions, and timeouts."
  },
  {
    id: "appearance",
    label: "Appearance",
    command: "/config appearance",
    description: "Theme and density placeholders."
  }
];

const EMPTY_SNIPPET: SnippetFormState = {
  name: "",
  trigger: "",
  content: "",
  enabled: true,
  scope: "",
  appRestriction: ""
};

export function SettingsPanel({
  settings,
  snippets,
  fileIndexStatus,
  clipboardCount,
  plugins,
  permissionRequests,
  initialSection = "general",
  onSaveSettings,
  onRebuildIndex,
  onSaveSnippet,
  onDeleteSnippet,
  onClearClipboard,
  onGrantPluginPermission,
  onRevokePluginPermission,
  onDismissPluginPermissionRequest,
  onTogglePluginEnabled,
  onClose
}: SettingsPanelProps) {
  const [draft, setDraft] = useState(() => cloneSettings(settings));
  const [activeSection, setActiveSection] = useState<ConfigSection>(initialSection);
  const [privateAppsDraft, setPrivateAppsDraft] = useState(
    settings.clipboard.privateApps.join("\n")
  );
  const [indexPathDraft, setIndexPathDraft] = useState("");
  const [indexExclusionDraft, setIndexExclusionDraft] = useState("");
  const [snippetDraft, setSnippetDraft] = useState<SnippetFormState>(EMPTY_SNIPPET);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(
    snippets[0]?.id ?? null
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSnippet, setSavingSnippet] = useState(false);

  useEffect(() => {
    setDraft(cloneSettings(settings));
    setPrivateAppsDraft(settings.clipboard.privateApps.join("\n"));
  }, [settings]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!selectedSnippetId) {
      setSnippetDraft(EMPTY_SNIPPET);
      return;
    }

    const snippet = snippets.find((entry) => entry.id === selectedSnippetId);
    if (snippet) {
      setSnippetDraft(toSnippetForm(snippet));
    }
  }, [selectedSnippetId, snippets]);

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await onSaveSettings({
        ...draft,
        indexPaths: draft.indexPaths.filter((entry) => entry.trim().length > 0),
        indexExclusions: draft.indexExclusions.filter((entry) => entry.trim().length > 0),
        clipboard: {
          ...draft.clipboard,
          privateApps: parseLines(privateAppsDraft)
        }
      });
    } catch {
      // The parent surface owns error presentation. Keep the settings form responsive.
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveSnippet() {
    const nextSnippet = normalizeSnippetForm(snippetDraft);
    if (!nextSnippet.name || !nextSnippet.trigger || !nextSnippet.content) {
      return;
    }

    setSavingSnippet(true);
    try {
      const saved = await onSaveSnippet(nextSnippet);
      setSelectedSnippetId(saved.id);
      setSnippetDraft(toSnippetForm(saved));
    } catch {
      // The parent surface owns error presentation. Keep the editor responsive.
    } finally {
      setSavingSnippet(false);
    }
  }

  async function handleDeleteSnippet(id: string) {
    try {
      await onDeleteSnippet(id);
      const nextSnippet = snippets.find((entry) => entry.id !== id);
      setSelectedSnippetId(nextSnippet?.id ?? null);
      if (!nextSnippet) {
        setSnippetDraft(EMPTY_SNIPPET);
      }
    } catch {
      // The parent surface owns error presentation. Keep the editor responsive.
    }
  }

  const sectionMeta =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ??
    SETTINGS_SECTIONS[0];

  return (
    <section className="shell-panel rounded-[28px] p-4 md:p-5">
      <div className="flex flex-col gap-4 border-b border-[color:var(--shell-border)] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="shell-kicker">Settings</div>
            <div className="mt-2 text-2xl font-semibold text-[color:var(--shell-text-primary)]">
              {sectionMeta.label}
            </div>
            <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
              {sectionMeta.description}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClassName} onClick={onClose}>
              Back
            </button>
            <button
              type="button"
              className={primaryButtonClassName}
              onClick={() => {
                void handleSaveSettings();
              }}
              disabled={savingSettings}
            >
              {savingSettings ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={clsx(
                "rounded-full border px-3 py-1.5 text-sm transition",
                section.id === activeSection
                  ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)] text-[color:var(--shell-text-primary)]"
                  : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] text-[color:var(--shell-text-secondary)] hover:border-[color:var(--shell-border-strong)] hover:text-[color:var(--shell-text-primary)]"
              )}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-4 py-3 text-sm text-[color:var(--shell-text-secondary)]">
          Command entry: <code>{sectionMeta.command}</code>
        </div>
      </div>

      <div className="mt-4">{renderActiveSection()}</div>
    </section>
  );

  function renderActiveSection(): ReactNode {
    switch (activeSection) {
      case "general":
        return (
          <div className="space-y-4">
            <SectionCard
              title="General"
              description="Launcher-wide preferences, language, and baseline search defaults."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Language">
                  <select
                    value={draft.language}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        language: event.target.value as LauncherSettings["language"]
                      })
                    }
                    className={selectClassName}
                  >
                    <option value="system">Follow system</option>
                    <option value="en-US">English</option>
                    <option value="zh-CN">简体中文</option>
                  </select>
                </Field>

                <Field label="Max results">
                  <input
                    type="number"
                    min={3}
                    max={24}
                    value={draft.search.maxResults}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        search: {
                          ...draft.search,
                          maxResults: clampNumber(event.target.value, 9, 3, 24)
                        }
                      })
                    }
                    className={inputClassName}
                  />
                </Field>

                <Field label="Default web engine">
                  <input
                    type="text"
                    value={draft.webSearch.defaultEngine}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        webSearch: {
                          ...draft.webSearch,
                          defaultEngine: event.target.value
                        }
                      })
                    }
                    className={inputClassName}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              title="Hotkey"
              description="Scaffold for global hotkey customization. Native key capture remains a later TODO."
            >
              <Field label="Launcher hotkey">
                <input
                  type="text"
                  value={draft.hotkey}
                  onChange={(event) => setDraft({ ...draft, hotkey: event.target.value })}
                  className={inputClassName}
                />
              </Field>
              <p className="mt-2 text-sm text-slate-400">
                TODO: replace free-form input with a platform-aware recorder and conflict
                detection.
              </p>
            </SectionCard>
          </div>
        );

      case "search":
        return (
          <SectionCard
            title="Search"
            description="Provider weights and scope shortcuts that drive the ranking pipeline."
          >
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatusMetricCard
                title="File index"
                value={fileIndexStatus?.state ?? "bootstrapping"}
                detail={
                  fileIndexStatus?.message ??
                  "Lightweight filename and path indexing powers file search."
                }
              />
              <StatusMetricCard
                title="Indexed files"
                value={String(fileIndexStatus?.indexedCount ?? 0)}
                detail={
                  fileIndexStatus?.truncated
                    ? `Current cap reached at ${fileIndexStatus.maxIndexedFiles} items.`
                    : `${fileIndexStatus?.indexedPaths.length ?? 0} directories included.`
                }
              />
              <StatusMetricCard
                title="Last rebuild"
                value={formatTimestamp(fileIndexStatus?.lastIndexedAt)}
                detail="Use /config indexing to review roots, exclusions, and rebuild health."
              />
              <StatusMetricCard
                title="File ranking"
                value="Fuzzy + recency"
                detail="Filename/path matching combines prefix, exact match, modified time, and usage history."
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SOURCE_WEIGHT_FIELDS.map((source) => (
                <Field key={source} label={`${source} weight`}>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={3}
                    value={draft.search.sourceWeights[source] ?? 1}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        search: {
                          ...draft.search,
                          sourceWeights: {
                            ...draft.search.sourceWeights,
                            [source]: clampFloat(event.target.value, 1, 0, 3)
                          }
                        }
                      })
                    }
                    className={inputClassName}
                  />
                </Field>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <ShortcutTag>`app safari`</ShortcutTag>
              <ShortcutTag>`file invoice`</ShortcutTag>
              <ShortcutTag>`clip deploy`</ShortcutTag>
              <ShortcutTag>`;standup`</ShortcutTag>
            </div>
            <p className="mt-3 text-sm text-[color:var(--shell-text-secondary)]">
              File results stay lightweight by design. They rank on filename and path
              match quality, prefix and exact bonuses, modified-time recency, and local
              usage history.
            </p>
          </SectionCard>
        );

      case "clipboard":
        return (
          <SectionCard
            title="Clipboard"
            description="Text-first history with local storage, privacy scaffolding, and action hooks."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Stored items">
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={draft.clipboard.maxItems}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      clipboard: {
                        ...draft.clipboard,
                        maxItems: clampNumber(event.target.value, 80, 10, 300)
                      }
                    })
                  }
                  className={inputClassName}
                />
              </Field>

              <Field label="Poll interval (ms)">
                <input
                  type="number"
                  min={400}
                  step={100}
                  value={draft.clipboard.pollIntervalMs}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      clipboard: {
                        ...draft.clipboard,
                        pollIntervalMs: clampNumber(event.target.value, 1200, 400, 10_000)
                      }
                    })
                  }
                  className={inputClassName}
                />
              </Field>

              <Field label="Current local items">
                <div className={staticFieldClassName}>{clipboardCount}</div>
              </Field>
            </div>

            <Field label="Private apps (one per line)">
              <textarea
                value={privateAppsDraft}
                onChange={(event) => setPrivateAppsDraft(event.target.value)}
                rows={4}
                className={textareaClassName}
                placeholder="1Password\nKeychain Access"
              />
            </Field>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => {
                  void onClearClipboard();
                }}
              >
                Clear history
              </button>
              <span className="text-sm text-slate-400">
                TODO: enforce private-app exclusion from native clipboard watchers per
                platform.
              </span>
            </div>
          </SectionCard>
        );

      case "indexing":
        return (
          <SectionCard
            title="Directory Indexing"
            description="Lightweight filename, path, and metadata indexing only. Manage roots and exclusions here, then rebuild."
          >
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatusMetricCard
                title="State"
                value={fileIndexStatus?.state ?? "bootstrapping"}
                detail={
                  fileIndexStatus?.lastError ??
                  fileIndexStatus?.message ??
                  "The file index is ready when lightweight metadata has been scanned."
                }
              />
              <StatusMetricCard
                title="Indexed entries"
                value={String(fileIndexStatus?.indexedCount ?? 0)}
                detail={
                  fileIndexStatus?.truncated
                    ? `Hit the current cap of ${fileIndexStatus.maxIndexedFiles} indexed items.`
                    : "Below the current lightweight index cap."
                }
              />
              <StatusMetricCard
                title="Directories"
                value={String(draft.indexPaths.length || fileIndexStatus?.indexedPaths.length || 0)}
                detail="Empty means the default Desktop, Documents, and Downloads roots."
              />
              <StatusMetricCard
                title="Last rebuild"
                value={formatTimestamp(fileIndexStatus?.lastIndexedAt)}
                detail={
                  draft.indexingPaused
                    ? "Indexing is paused until you resume it."
                    : "Rebuild after changing roots or exclusions."
                }
              />
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <ToggleRow
                label="Pause automatic indexing"
                checked={draft.indexingPaused}
                onChange={(checked) =>
                  setDraft({
                    ...draft,
                    indexingPaused: checked
                  })
                }
              />
              <div className="rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3 text-sm text-[color:var(--shell-text-secondary)]">
                Exclusions and directory changes only apply after a rebuild. Existing
                indexed results remain searchable until then.
              </div>
            </div>

            <Field label="Indexed directories">
              <div className="flex flex-wrap gap-2">
                {(draft.indexPaths.length > 0
                  ? draft.indexPaths
                  : fileIndexStatus?.indexedPaths ?? []
                ).map((path) => (
                  <div
                    key={path}
                    className="flex items-center gap-2 rounded-full border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-3 py-2 text-sm text-[color:var(--shell-text-primary)]"
                  >
                    <span>{path}</span>
                    <button
                      type="button"
                      className="text-[color:var(--shell-text-secondary)] transition hover:text-[color:var(--shell-text-primary)]"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          indexPaths: draft.indexPaths.filter((entry) => entry !== path)
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </Field>

            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={indexPathDraft}
                onChange={(event) => setIndexPathDraft(event.target.value)}
                className={inputClassName}
                placeholder="~/Projects"
              />
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => {
                  const nextPath = indexPathDraft.trim();
                  if (!nextPath || draft.indexPaths.includes(nextPath)) {
                    return;
                  }

                  setDraft({
                    ...draft,
                    indexPaths: [...draft.indexPaths, nextPath]
                  });
                  setIndexPathDraft("");
                }}
              >
                Add directory
              </button>
            </div>

            <Field label="Excluded paths">
              <div className="flex flex-wrap gap-2">
                {draft.indexExclusions.map((path) => (
                  <div
                    key={path}
                    className="flex items-center gap-2 rounded-full border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-3 py-2 text-sm text-[color:var(--shell-text-primary)]"
                  >
                    <span>{path}</span>
                    <button
                      type="button"
                      className="text-[color:var(--shell-text-secondary)] transition hover:text-[color:var(--shell-text-primary)]"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          indexExclusions: draft.indexExclusions.filter(
                            (entry) => entry !== path
                          )
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </Field>

            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={indexExclusionDraft}
                onChange={(event) => setIndexExclusionDraft(event.target.value)}
                className={inputClassName}
                placeholder="~/Projects/node_modules"
              />
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => {
                  const nextPath = indexExclusionDraft.trim();
                  if (!nextPath || draft.indexExclusions.includes(nextPath)) {
                    return;
                  }

                  setDraft({
                    ...draft,
                    indexExclusions: [...draft.indexExclusions, nextPath]
                  });
                  setIndexExclusionDraft("");
                }}
              >
                Add exclusion
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => {
                  void onRebuildIndex();
                }}
                disabled={draft.indexingPaused}
              >
                Rebuild index
              </button>
              <div className="text-sm text-[color:var(--shell-text-secondary)]">
                Implicit ignores: <code>.git</code>, <code>node_modules</code>,{" "}
                <code>target</code>, <code>Library</code>, <code>.cache</code>.
              </div>
            </div>

            <p className="mt-3 text-sm text-[color:var(--shell-text-secondary)]">
              Current index status: {fileIndexStatus?.state ?? "bootstrapping"} ·{" "}
              {fileIndexStatus?.indexedCount ?? 0} entries ·{" "}
              {fileIndexStatus?.indexedPaths.length ?? draft.indexPaths.length} directories ·{" "}
              {fileIndexStatus?.excludedPaths.length ?? draft.indexExclusions.length} exclusions.
            </p>

            {fileIndexStatus?.lastError ? (
              <p className="mt-2 text-sm text-amber-200">
                Last index error: {fileIndexStatus.lastError}
              </p>
            ) : null}
          </SectionCard>
        );

      case "snippets":
        return (
          <SectionCard
            title="Snippets"
            description="Local snippet storage with lightweight variable expansion and search integration."
          >
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <ToggleRow
                label="Show snippets in launcher search"
                checked={draft.snippets.enabledInSearch}
                onChange={(checked) =>
                  setDraft({
                    ...draft,
                    snippets: {
                      ...draft.snippets,
                      enabledInSearch: checked
                    }
                  })
                }
              />
              <ToggleRow
                label="Enable expansion hooks"
                checked={draft.snippets.enableExpansionHooks}
                onChange={(checked) =>
                  setDraft({
                    ...draft,
                    snippets: {
                      ...draft.snippets,
                      enableExpansionHooks: checked
                    }
                  })
                }
              />
            </div>

            <p className="mb-3 text-sm text-slate-400">
              Variables: <code>{"{{date}}"}</code>, <code>{"{{time}}"}</code>,{" "}
              <code>{"{{clipboard}}"}</code>, <code>{"{{uuid}}"}</code>. TODO: global text
              expansion hooks remain platform-specific work.
            </p>

            <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => {
                    setSelectedSnippetId(null);
                    setSnippetDraft(EMPTY_SNIPPET);
                  }}
                >
                  New snippet
                </button>

                <div className="space-y-2">
                  {snippets.map((snippet) => (
                    <button
                      key={snippet.id}
                      type="button"
                      className={clsx(
                        "w-full rounded-2xl border px-3 py-3 text-left transition",
                        selectedSnippetId === snippet.id
                          ? "border-pulse-400/50 bg-pulse-500/12"
                          : "border-white/8 bg-black/20 hover:border-white/16"
                      )}
                      onClick={() => setSelectedSnippetId(snippet.id)}
                    >
                      <div className="font-medium text-white">{snippet.name}</div>
                      <div className="text-sm text-slate-400">{snippet.trigger}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Name">
                    <input
                      type="text"
                      value={snippetDraft.name}
                      onChange={(event) =>
                        setSnippetDraft({ ...snippetDraft, name: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </Field>

                  <Field label="Trigger">
                    <input
                      type="text"
                      value={snippetDraft.trigger}
                      onChange={(event) =>
                        setSnippetDraft({ ...snippetDraft, trigger: event.target.value })
                      }
                      className={inputClassName}
                      placeholder=";standup"
                    />
                  </Field>
                </div>

                <Field label="Content">
                  <textarea
                    value={snippetDraft.content}
                    onChange={(event) =>
                      setSnippetDraft({ ...snippetDraft, content: event.target.value })
                    }
                    rows={8}
                    className={textareaClassName}
                  />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Scope scaffold">
                    <input
                      type="text"
                      value={snippetDraft.scope}
                      onChange={(event) =>
                        setSnippetDraft({ ...snippetDraft, scope: event.target.value })
                      }
                      className={inputClassName}
                      placeholder="email"
                    />
                  </Field>

                  <Field label="App restriction scaffold">
                    <input
                      type="text"
                      value={snippetDraft.appRestriction}
                      onChange={(event) =>
                        setSnippetDraft({
                          ...snippetDraft,
                          appRestriction: event.target.value
                        })
                      }
                      className={inputClassName}
                      placeholder="com.apple.mail"
                    />
                  </Field>
                </div>

                <ToggleRow
                  label="Snippet enabled"
                  checked={snippetDraft.enabled}
                  onChange={(checked) =>
                    setSnippetDraft({ ...snippetDraft, enabled: checked })
                  }
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primaryButtonClassName}
                    onClick={() => {
                      void handleSaveSnippet();
                    }}
                    disabled={savingSnippet}
                  >
                    {savingSnippet ? "Saving..." : "Save snippet"}
                  </button>
                  {snippetDraft.id ? (
                    <button
                      type="button"
                      className={secondaryButtonClassName}
                      onClick={() => {
                        void handleDeleteSnippet(snippetDraft.id!);
                      }}
                    >
                      Delete snippet
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionCard>
        );

      case "plugins":
        return (
          <SectionCard
            title="Plugins"
            description="Worker-isolated plugin host with explicit local permissions and graceful failure handling."
          >
            <div className="space-y-3">
              <ToggleRow
                label="Enable plugin host"
                checked={draft.plugins.enableHost}
                onChange={(checked) =>
                  setDraft({
                    ...draft,
                    plugins: {
                      ...draft.plugins,
                      enableHost: checked
                    }
                  })
                }
              />
              <ToggleRow
                label="Prompt on first permission"
                checked={draft.plugins.promptOnFirstPermission}
                onChange={(checked) =>
                  setDraft({
                    ...draft,
                    plugins: {
                      ...draft.plugins,
                      promptOnFirstPermission: checked
                    }
                  })
                }
              />
              <Field label="Plugin timeout (ms)">
                <input
                  type="number"
                  min={250}
                  max={10_000}
                  value={draft.plugins.timeoutMs}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      plugins: {
                        ...draft.plugins,
                        timeoutMs: clampNumber(event.target.value, 1200, 250, 10_000)
                      }
                    })
                  }
                  className={inputClassName}
                />
              </Field>

              {permissionRequests.length > 0 ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4">
                  <div className="mb-3 font-medium text-amber-100">
                    Pending permission prompts
                  </div>
                  <div className="space-y-3">
                    {permissionRequests.map((request) => (
                      <div
                        key={`${request.pluginId}:${request.permission}`}
                        className="rounded-2xl border border-white/8 bg-black/20 p-3"
                      >
                        <div className="text-sm text-white">
                          {request.pluginName} requests <code>{request.permission}</code>
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          {request.reason}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={primaryButtonClassName}
                            onClick={() => {
                              void onGrantPluginPermission(
                                request.pluginId,
                                request.permission
                              );
                            }}
                          >
                            Grant
                          </button>
                          <button
                            type="button"
                            className={secondaryButtonClassName}
                            onClick={() =>
                              onDismissPluginPermissionRequest(
                                request.pluginId,
                                request.permission
                              )
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {plugins.map((plugin) => {
                  const enabled = !draft.plugins.disabledPluginIds.includes(
                    plugin.pluginId
                  );

                  return (
                    <div
                      key={plugin.pluginId}
                      className="rounded-2xl border border-white/8 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">
                            {plugin.manifest.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-400">
                            {plugin.manifest.id} · v{plugin.manifest.version}
                          </div>
                          {plugin.manifest.description ? (
                            <div className="mt-2 text-sm text-slate-300">
                              {plugin.manifest.description}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-full border border-white/8 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                            {plugin.status}
                          </div>
                          <button
                            type="button"
                            className={secondaryButtonClassName}
                            onClick={() => {
                              void onTogglePluginEnabled(plugin.pluginId, !enabled);
                            }}
                          >
                            {enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>

                      {plugin.manifest.commands.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {plugin.manifest.commands.map((command) => (
                            <div
                              key={command.name}
                              className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-slate-300"
                            >
                              {command.name} · {command.title}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {plugin.manifest.permissions.length > 0 ? (
                        <div className="mt-3">
                          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                            Permissions
                          </div>
                          <div className="space-y-2">
                            {plugin.manifest.permissions.map((permission) => {
                              const granted =
                                plugin.grantedPermissions.includes(permission);

                              return (
                                <div
                                  key={permission}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/25 px-3 py-3"
                                >
                                  <div className="text-sm text-slate-200">
                                    <code>{permission}</code>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <div className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">
                                      {granted ? "Granted" : "Not granted"}
                                    </div>
                                    {granted ? (
                                      <button
                                        type="button"
                                        className={secondaryButtonClassName}
                                        onClick={() => {
                                          void onRevokePluginPermission(
                                            plugin.pluginId,
                                            permission
                                          );
                                        }}
                                      >
                                        Revoke
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className={secondaryButtonClassName}
                                        onClick={() => {
                                          void onGrantPluginPermission(
                                            plugin.pluginId,
                                            permission
                                          );
                                        }}
                                      >
                                        Grant
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-slate-400">
                          This plugin does not request permissions.
                        </div>
                      )}

                      {plugin.validationErrors.length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/8 p-3 text-sm text-rose-100">
                          {plugin.validationErrors.join(" ")}
                        </div>
                      ) : null}

                      {plugin.lastError ? (
                        <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/8 p-3 text-sm text-amber-100">
                          Last host error: {plugin.lastError}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <p className="text-sm text-slate-400">
                TODO: move plugin execution into a stricter sandbox and add signed-install
                flows for third-party plugins.
              </p>
            </div>
          </SectionCard>
        );

      case "appearance":
        return (
          <SectionCard
            title="Appearance"
            description="Theme and density placeholder while the launcher UI system stays compact."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Theme">
                <select
                  value={draft.theme}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      theme: event.target.value as LauncherSettings["theme"]
                    })
                  }
                  className={inputClassName}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>

              <div className="space-y-3">
                <ToggleRow
                  label="Dense mode"
                  checked={draft.appearance.denseMode}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      appearance: {
                        ...draft.appearance,
                        denseMode: checked
                      }
                    })
                  }
                />
                <ToggleRow
                  label="Reduce motion"
                  checked={draft.appearance.reduceMotion}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      appearance: {
                        ...draft.appearance,
                        reduceMotion: checked
                      }
                    })
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              TODO: add a broader theming system once the visual language stabilizes
              across desktop platforms.
            </p>
          </SectionCard>
        );

      case "workflow":
        return (
          <SectionCard
            title="Workflow"
            description="Command-driven configuration entry for future workflow automation."
          >
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                This section is the placeholder for workflow authoring and automation
                rules that should be reachable from the launcher via{" "}
                <code>/config workflow</code>.
              </p>
              <p>
                Today, the closest extension points are snippets, plugin commands, and
                action composition. A dedicated workflow editor still needs a separate
                model and execution layer.
              </p>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-slate-400">
                TODO: add workflow definitions, ordering, triggers, and per-workflow
                permissions without turning the launcher shell into a full-page settings
                app.
              </div>
            </div>
          </SectionCard>
        );
    }
  }
}

function SectionCard({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4 md:p-5">
      <div className="mb-4">
        <div className="text-xl font-semibold text-[color:var(--shell-text-primary)]">
          {title}
        </div>
        <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
          {description}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--shell-text-tertiary)]">
        {label}
      </div>
      {children}
    </label>
  );
}

function StatusMetricCard({
  title,
  value,
  detail
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--shell-text-tertiary)]">
        {title}
      </div>
      <div className="mt-2 text-base font-semibold text-[color:var(--shell-text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">{detail}</div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-4 py-3">
      <span className="text-sm text-[color:var(--shell-text-primary)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={clsx(
          "inline-flex h-7 w-14 items-center rounded-full border px-1 transition",
          checked
            ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)]"
            : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)]"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={clsx(
            "h-5 w-5 rounded-full bg-white transition",
            checked ? "translate-x-7" : "translate-x-0"
          )}
        />
      </button>
    </label>
  );
}

function ShortcutTag({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-full border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-3 py-1.5">
      {children}
    </div>
  );
}

function toSnippetForm(snippet: SnippetRecord): SnippetFormState {
  return {
    id: snippet.id,
    name: snippet.name,
    trigger: snippet.trigger,
    content: snippet.content,
    enabled: snippet.enabled,
    scope: snippet.scope ?? "",
    appRestriction: snippet.appRestriction ?? ""
  };
}

function normalizeSnippetForm(snippet: SnippetFormState): SnippetInput {
  return {
    id: snippet.id,
    name: snippet.name.trim(),
    trigger: snippet.trigger.trim(),
    content: snippet.content,
    enabled: snippet.enabled,
    scope: snippet.scope.trim() || null,
    appRestriction: snippet.appRestriction.trim() || null
  };
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function clampFloat(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function cloneSettings(settings: LauncherSettings): LauncherSettings {
  return {
    ...settings,
    indexPaths: [...settings.indexPaths],
    indexExclusions: [...settings.indexExclusions],
    indexingPaused: settings.indexingPaused,
    search: {
      ...settings.search,
      sourceWeights: { ...settings.search.sourceWeights }
    },
    clipboard: {
      ...settings.clipboard,
      privateApps: [...settings.clipboard.privateApps]
    },
    snippets: {
      ...settings.snippets
    },
    plugins: {
      ...settings.plugins,
      disabledPluginIds: [...settings.plugins.disabledPluginIds],
      grantedPermissions: Object.fromEntries(
        Object.entries(settings.plugins.grantedPermissions).map(
          ([pluginId, permissions]) => [pluginId, [...permissions]]
        )
      )
    },
    appearance: {
      ...settings.appearance
    },
    webSearch: {
      ...settings.webSearch,
      shortcuts: { ...settings.webSearch.shortcuts }
    }
  };
}

function formatTimestamp(value?: number | null): string {
  if (!value) {
    return "Not indexed yet";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(value);
  } catch {
    return "Recently";
  }
}

const inputClassName =
  "w-full rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-4 py-3 text-sm text-[color:var(--shell-text-primary)] outline-none transition placeholder:text-[color:var(--shell-text-muted)] focus:border-[color:var(--shell-border-strong)] focus:bg-[color:var(--shell-fill-soft)]";

const selectClassName = inputClassName;

const textareaClassName =
  "w-full rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-4 py-3 text-sm text-[color:var(--shell-text-primary)] outline-none transition placeholder:text-[color:var(--shell-text-muted)] focus:border-[color:var(--shell-border-strong)] focus:bg-[color:var(--shell-fill-soft)]";

const staticFieldClassName =
  "flex min-h-[50px] items-center rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-4 py-3 text-sm text-[color:var(--shell-text-primary)]";

const primaryButtonClassName =
  "button-primary disabled:cursor-not-allowed disabled:opacity-70";

const secondaryButtonClassName =
  "button-secondary";
