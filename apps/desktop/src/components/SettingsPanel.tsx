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
} from "@osb/shared-types";

import type { ConfigSection } from "../features/commands/config-command";
import { MarketplacePanel } from "./MarketplacePanel";

interface SettingsPanelProps {
  settings: LauncherSettings;
  snippets: SnippetRecord[];
  fileIndexStatus?: FileIndexStatus | null;
  clipboardCount: number;
  plugins: PluginRuntimeSnapshot[];
  permissionRequests: PluginPermissionRequest[];
  useChineseCopy: boolean;
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

function getSourceWeightLabel(source: ResultSource, useChineseCopy: boolean): string {
  const labels: Record<ResultSource, string> = useChineseCopy
    ? {
        apps: "应用",
        files: "文件",
        web: "网页",
        clipboard: "剪贴板",
        snippets: "片段",
        plugins: "插件",
        workflows: "工作流",
        system: "系统"
      }
    : {
        apps: "Apps",
        files: "Files",
        web: "Web",
        clipboard: "Clipboard",
        snippets: "Snippets",
        plugins: "Plugins",
        workflows: "Workflows",
        system: "System"
      };

  return useChineseCopy ? `${labels[source]} 权重` : `${labels[source]} weight`;
}

function formatIndexStateLabel(
  state: FileIndexStatus["state"] | undefined | null,
  useChineseCopy: boolean
): string {
  if (!state) {
    return useChineseCopy ? "初始化中" : "bootstrapping";
  }

  if (!useChineseCopy) {
    return state;
  }

  switch (state) {
    case "idle":
      return "空闲";
    case "indexing":
      return "索引中";
    case "ready":
      return "就绪";
    case "error":
      return "错误";
    case "stale":
      return "待刷新";
    case "paused":
      return "已暂停";
  }
}

function formatPluginStatusLabel(
  status: PluginRuntimeSnapshot["status"],
  useChineseCopy: boolean
): string {
  if (!useChineseCopy) {
    return status;
  }

  switch (status) {
    case "loading":
      return "加载中";
    case "ready":
      return "就绪";
    case "disabled":
      return "已禁用";
    case "permission-required":
      return "需要权限";
    case "timed-out":
      return "超时";
    case "error":
      return "错误";
  }
}

function getSettingsSections(useChineseCopy: boolean): Array<{
  id: ConfigSection;
  label: string;
  command: string;
  description: string;
}> {
  return useChineseCopy
    ? [
        {
          id: "overview",
          label: "总览",
          command: "config overview",
          description: "查看整个启动器的全局计数和健康状态。"
        },
        {
          id: "general",
          label: "常规",
          command: "config general",
          description: "启动器默认行为与快捷键基础配置。"
        },
        {
          id: "search",
          label: "搜索",
          command: "config search",
          description: "Provider 权重、结果数量和作用域提示。"
        },
        {
          id: "clipboard",
          label: "剪贴板",
          command: "config clipboard",
          description: "本地剪贴板保留策略与隐私设置。"
        },
        {
          id: "indexing",
          label: "索引",
          command: "config indexing",
          description: "轻量文件搜索所使用的目录根路径。"
        },
        {
          id: "snippets",
          label: "片段",
          command: "config snippets",
          description: "片段的增删改查与展开设置。"
        },
        {
          id: "plugins",
          label: "插件",
          command: "config plugins",
          description: "插件宿主状态、权限和超时配置。"
        },
        {
          id: "marketplace",
          label: "插件市场",
          command: "config marketplace",
          description: "浏览、安装和管理社区插件。"
        },
        {
          id: "appearance",
          label: "外观",
          command: "config appearance",
          description: "主题和密度等外观设置。"
        }
      ]
    : [
        {
          id: "overview",
          label: "Overview",
          command: "config overview",
          description: "Cross-launcher counts and health snapshot."
        },
        {
          id: "general",
          label: "General",
          command: "config general",
          description: "Launcher defaults and hotkey scaffolding."
        },
        {
          id: "search",
          label: "Search",
          command: "config search",
          description: "Provider weights, result limits, and scope hints."
        },
        {
          id: "clipboard",
          label: "Clipboard",
          command: "config clipboard",
          description: "Local clipboard retention and privacy scaffolding."
        },
        {
          id: "indexing",
          label: "Indexing",
          command: "config indexing",
          description: "Directory roots for lightweight file search."
        },
        {
          id: "snippets",
          label: "Snippets",
          command: "config snippets",
          description: "Snippet CRUD and expansion settings."
        },
        {
          id: "plugins",
          label: "Plugins",
          command: "config plugins",
          description: "Plugin host state, permissions, and timeouts."
        },
        {
          id: "marketplace",
          label: "Marketplace",
          command: "config marketplace",
          description: "Browse, install, and manage community plugins."
        },
        {
          id: "appearance",
          label: "Appearance",
          command: "config appearance",
          description: "Theme and density placeholders."
        }
      ];
}

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
  useChineseCopy,
  initialSection = "overview",
  onSaveSettings,
  onRebuildIndex,
  onSaveSnippet,
  onDeleteSnippet,
  onClearClipboard,
  onGrantPluginPermission,
  onRevokePluginPermission,
  onDismissPluginPermissionRequest,
  onTogglePluginEnabled,
  onClose: _onClose
}: SettingsPanelProps) {
  const sections = getSettingsSections(useChineseCopy);
  const copy = useChineseCopy
    ? {
        settingsTitle: "设置",
        save: "保存",
        saving: "保存中...",
        metricDedicated: "独立界面",
        overviewTitle: "总览",
        overviewDescription: "把整个启动器的关键计数和健康状态集中放在这里。",
        overviewFooter: "把这里当作全局快照入口，需要调整具体行为时再进入对应分区。",
        metricTitles: {
          indexedFiles: "已索引文件",
          clipboard: "剪贴板",
          snippets: "片段",
          plugins: "插件",
          workflow: "工作流",
          permPrompts: "权限请求"
        },
        metricDetails: {
          indexedFiles: "轻量文件名和路径条目已可用于文件搜索。",
          clipboard: "本地剪贴板条目可用于搜索和动作执行。",
          snippets: "已保存片段可用于搜索和展开动作。",
          plugins: "当前工作区中已发现的插件运行时或清单。",
          workflow: "工作流保持独立界面，避免把启动器 bar 挤满。",
          permPrompts: "等待处理的插件权限批准请求。"
        },
        general: {
          title: "常规",
          description: "启动器级别的偏好、语言以及基础搜索默认值。",
          hotkeyTitle: "快捷键",
          hotkeyDescription: "全局快捷键自定义的基础版本。原生按键录制后续补齐。",
          language: "语言",
          followSystem: "跟随系统",
          english: "English",
          simplifiedChinese: "简体中文",
          maxResults: "最大结果数",
          defaultWebEngine: "默认网页搜索引擎",
          launcherHotkey: "启动器快捷键",
          hotkeyTodo: "快捷键录制和冲突检测将在后续版本中支持。"
        },
        search: {
          title: "搜索",
          description: "调节排序管线中的 Provider 权重和作用域快捷方式。",
          fileIndex: "文件索引",
          fileIndexFallback: "轻量文件名和路径索引支撑文件搜索。",
          indexedFiles: "已索引文件",
          indexedFilesCap: (maxIndexedFiles: number) =>
            `当前已达到 ${maxIndexedFiles} 条的索引上限。`,
          indexedFilesDirectories: (directoryCount: number) =>
            `已纳入 ${directoryCount} 个目录。`,
          lastRebuild: "最近重建",
          lastRebuildDetail: "用 config indexing 查看根目录、排除项和重建状态。",
          fileRanking: "文件排序",
          fileRankingValue: "模糊 + 时效",
          fileRankingDetail:
            "文件名和路径匹配会综合 prefix、精确匹配、修改时间和使用历史。",
          rankingNote:
            "文件结果刻意保持轻量，只根据文件名与路径匹配质量、prefix/精确命中奖励、修改时间和本地使用历史来排序。"
        },
        clipboard: {
          title: "剪贴板",
          description: "以文本优先的本地历史，带隐私排除和动作钩子。",
          storedItems: "存储条数",
          pollInterval: "轮询间隔（毫秒）",
          currentItems: "当前本地条目",
          privateApps: "私密应用（每行一个）",
          privateAppsPlaceholder: "1Password\n钥匙串访问",
          clearHistory: "清空历史",
          privacyTodo: "私密应用排除将在后续版本中接入原生剪贴板监听。"
        },
        indexing: {
          title: "目录索引",
          description:
            "这里只做轻量文件名、路径和元数据索引。管理根目录和排除项后再重建。",
          state: "状态",
          indexedEntries: "已索引条目",
          indexedEntriesCap: (maxIndexedFiles: number) =>
            `已触达当前 ${maxIndexedFiles} 条的轻量索引上限。`,
          indexedEntriesBelowCap: "仍低于当前轻量索引上限。",
          directories: "目录数",
          directoriesDetail: "为空时会使用主目录作为默认根目录。",
          lastRebuild: "最近重建",
          lastRebuildPaused: "索引已暂停，恢复后才会继续。",
          lastRebuildReady: "修改根目录或排除项后请重建。",
          pauseAutomaticIndexing: "暂停自动索引",
          rebuildNotice:
            "目录和排除项的变更只有在重建后才生效；在那之前，现有结果仍可搜索。",
          indexedDirectories: "已索引目录",
          excludedPaths: "排除路径",
          remove: "移除",
          addDirectory: "添加目录",
          addExclusion: "添加排除项",
          rebuildIndex: "重建索引",
          implicitIgnores: "隐式忽略项",
          currentStatus: (
            stateLabel: string,
            indexedCount: number,
            directoryCount: number,
            exclusionCount: number
          ) =>
            `当前索引状态：${stateLabel} · ${indexedCount} 条目 · ${directoryCount} 个目录 · ${exclusionCount} 个排除项。`,
          lastError: "最近一次索引错误"
        },
        snippets: {
          title: "片段",
          description: "本地片段存储，支持轻量变量展开和搜索集成。",
          showInSearch: "在启动器搜索中显示片段",
          enableHooks: "启用展开钩子",
          variablesNote:
            "变量：{{date}}、{{time}}、{{clipboard}}、{{uuid}}。全局文本展开钩子将在后续版本中按平台实现。",
          newSnippet: "新建片段",
          name: "名称",
          trigger: "触发词",
          content: "内容",
          scope: "作用域占位",
          appRestriction: "应用限制占位",
          enabled: "启用片段",
          saveSnippet: "保存片段",
          deleteSnippet: "删除片段"
        },
        plugins: {
          title: "插件",
          description: "Worker 隔离插件宿主，带显式本地权限和优雅失败处理。",
          enableHost: "启用插件宿主",
          promptOnFirstPermission: "首次权限请求时提示",
          timeout: "插件超时（毫秒）",
          pendingPrompts: "待处理权限请求",
          requestsPermission: (pluginName: string) => `${pluginName} 请求权限`,
          grant: "允许",
          dismiss: "忽略",
          disable: "禁用",
          enable: "启用",
          permissions: "权限",
          granted: "已允许",
          notGranted: "未允许",
          revoke: "撤销",
          noPermissions: "这个插件没有申请权限。",
          lastHostError: "最近一次宿主错误",
          sandboxTodo:
            "插件在 Worker 中隔离运行，后续将加入更严格的沙箱和第三方插件签名安装流程。"
        },
        appearance: {
          title: "外观",
          description: "启动器 UI 仍保持紧凑，这里先提供主题和密度相关设置。",
          theme: "主题",
          system: "跟随系统",
          light: "浅色",
          dark: "深色",
          denseMode: "紧凑模式",
          reduceMotion: "减少动效",
          todo: "更完整的主题系统将在桌面端视觉语言稳定后推出。"
        },
        workflow: {
          title: "工作流",
          description: "面向未来工作流自动化的命令式配置入口。",
          intro:
            "这里是工作流编排和自动化规则的占位入口，后续会通过 config workflow 从启动器进入。",
          today:
            "当前最接近的扩展点还是 snippets、plugin commands 和 action composition。专用工作流编辑器仍需要独立模型和执行层。",
          todo:
            "后续将补上工作流定义、排序、触发器和逐条权限控制。"
        },
        marketplace: {
          title: "插件市场",
          description: "浏览、安装和管理内置插件。"
        }
      }
    : {
        settingsTitle: "Settings",
        save: "Save",
        saving: "Saving...",
        metricDedicated: "Dedicated",
        overviewTitle: "Overview",
        overviewDescription: "Cross-launcher counts and health summarized in one place.",
        overviewFooter:
          "Use this section as the launcher-wide snapshot, then jump into the task-specific pages below when you need to change behavior.",
        metricTitles: {
          indexedFiles: "Indexed files",
          clipboard: "Clipboard",
          snippets: "Snippets",
          plugins: "Plugins",
          workflow: "Workflow",
          permPrompts: "Perm prompts"
        },
        metricDetails: {
          indexedFiles: "Lightweight filename and path entries ready for file search.",
          clipboard: "Local clipboard items available to search and actions.",
          snippets: "Saved snippets ready for search and expansion actions.",
          plugins: "Discovered plugin runtimes or manifests in the current workspace.",
          workflow: "Workflow opens as its own surface instead of bloating the launcher bar.",
          permPrompts: "Pending plugin permission approvals waiting for attention."
        },
        general: {
          title: "General",
          description: "Launcher-wide preferences, language, and baseline search defaults.",
          hotkeyTitle: "Hotkey",
          hotkeyDescription:
            "Global hotkey customization. Native key capture and conflict detection coming soon.",
          language: "Language",
          followSystem: "Follow system",
          english: "English",
          simplifiedChinese: "简体中文",
          maxResults: "Max results",
          defaultWebEngine: "Default web engine",
          launcherHotkey: "Launcher hotkey",
          hotkeyTodo:
            "Platform-aware key recorder and conflict detection coming in a future release."
        },
        search: {
          title: "Search",
          description: "Provider weights and scope shortcuts that drive the ranking pipeline.",
          fileIndex: "File index",
          fileIndexFallback: "Lightweight filename and path indexing powers file search.",
          indexedFiles: "Indexed files",
          indexedFilesCap: (maxIndexedFiles: number) =>
            `Current cap reached at ${maxIndexedFiles} items.`,
          indexedFilesDirectories: (directoryCount: number) =>
            `${directoryCount} directories included.`,
          lastRebuild: "Last rebuild",
          lastRebuildDetail: "Type config indexing to review roots, exclusions, and rebuild health.",
          fileRanking: "File ranking",
          fileRankingValue: "Fuzzy + recency",
          fileRankingDetail:
            "Filename/path matching combines prefix, exact match, modified time, and usage history.",
          rankingNote:
            "File results stay lightweight by design. They rank on filename and path match quality, prefix and exact bonuses, modified-time recency, and local usage history."
        },
        clipboard: {
          title: "Clipboard",
          description:
            "Text-first history with local storage, privacy scaffolding, and action hooks.",
          storedItems: "Stored items",
          pollInterval: "Poll interval (ms)",
          currentItems: "Current local items",
          privateApps: "Private apps (one per line)",
          privateAppsPlaceholder: "1Password\nKeychain Access",
          clearHistory: "Clear history",
          privacyTodo:
            "Private-app exclusion from native clipboard watchers coming in a future release."
        },
        indexing: {
          title: "Directory Indexing",
          description:
            "Lightweight filename, path, and metadata indexing only. Manage roots and exclusions here, then rebuild.",
          state: "State",
          indexedEntries: "Indexed entries",
          indexedEntriesCap: (maxIndexedFiles: number) =>
            `Hit the current cap of ${maxIndexedFiles} indexed items.`,
          indexedEntriesBelowCap: "Below the current lightweight index cap.",
          directories: "Directories",
          directoriesDetail:
            "Empty means the home directory is used as the default root.",
          lastRebuild: "Last rebuild",
          lastRebuildPaused: "Indexing is paused until you resume it.",
          lastRebuildReady: "Rebuild after changing roots or exclusions.",
          pauseAutomaticIndexing: "Pause automatic indexing",
          rebuildNotice:
            "Exclusions and directory changes only apply after a rebuild. Existing indexed results remain searchable until then.",
          indexedDirectories: "Indexed directories",
          excludedPaths: "Excluded paths",
          remove: "Remove",
          addDirectory: "Add directory",
          addExclusion: "Add exclusion",
          rebuildIndex: "Rebuild index",
          implicitIgnores: "Implicit ignores",
          currentStatus: (
            stateLabel: string,
            indexedCount: number,
            directoryCount: number,
            exclusionCount: number
          ) =>
            `Current index status: ${stateLabel} · ${indexedCount} entries · ${directoryCount} directories · ${exclusionCount} exclusions.`,
          lastError: "Last index error"
        },
        snippets: {
          title: "Snippets",
          description:
            "Local snippet storage with lightweight variable expansion and search integration.",
          showInSearch: "Show snippets in launcher search",
          enableHooks: "Enable expansion hooks",
          variablesNote:
            "Variables: {{date}}, {{time}}, {{clipboard}}, {{uuid}}. Global text expansion hooks are platform-specific and coming soon.",
          newSnippet: "New snippet",
          name: "Name",
          trigger: "Trigger",
          content: "Content",
          scope: "Scope scaffold",
          appRestriction: "App restriction scaffold",
          enabled: "Snippet enabled",
          saveSnippet: "Save snippet",
          deleteSnippet: "Delete snippet"
        },
        plugins: {
          title: "Plugins",
          description:
            "Worker-isolated plugin host with explicit local permissions and graceful failure handling.",
          enableHost: "Enable plugin host",
          promptOnFirstPermission: "Prompt on first permission",
          timeout: "Plugin timeout (ms)",
          pendingPrompts: "Pending permission prompts",
          requestsPermission: (pluginName: string) => `${pluginName} requests`,
          grant: "Grant",
          dismiss: "Dismiss",
          disable: "Disable",
          enable: "Enable",
          permissions: "Permissions",
          granted: "Granted",
          notGranted: "Not granted",
          revoke: "Revoke",
          noPermissions: "This plugin does not request permissions.",
          lastHostError: "Last host error",
          sandboxTodo:
            "Plugins run in isolated Workers. Stricter sandboxing and signed-install flows for third-party plugins are planned."
        },
        appearance: {
          title: "Appearance",
          description:
            "Theme and density placeholder while the launcher UI system stays compact.",
          theme: "Theme",
          system: "System",
          light: "Light",
          dark: "Dark",
          denseMode: "Dense mode",
          reduceMotion: "Reduce motion",
          todo:
            "A broader theming system will land once the visual language stabilizes across desktop platforms."
        },
        workflow: {
          title: "Workflow",
          description: "Command-driven configuration entry for future workflow automation.",
          intro:
            "This section is the placeholder for workflow authoring and automation rules that should be reachable from the launcher via config workflow.",
          today:
            "Today, the closest extension points are snippets, plugin commands, and action composition. A dedicated workflow editor still needs a separate model and execution layer.",
          todo:
            "Workflow definitions, ordering, triggers, and per-workflow permissions are planned for a future release."
        },
        marketplace: {
          title: "Marketplace",
          description: "Browse, install, and manage built-in plugins."
        }
      };
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

  const sectionMeta = sections.find((section) => section.id === activeSection) ?? sections[0];

  return (
    <section className="shell-panel rounded-[28px] p-4 md:p-5">
      <div className="flex flex-col gap-4 border-b border-[color:var(--shell-border)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="shell-kicker">{copy.settingsTitle}</div>
            <div className="mt-2 text-2xl font-semibold text-[color:var(--shell-text-primary)]">
              {sectionMeta.label}
            </div>
          </div>
          <button
            type="button"
            className={primaryButtonClassName}
            onClick={() => {
              void handleSaveSettings();
            }}
            disabled={savingSettings}
          >
            {savingSettings ? copy.saving : copy.save}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
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
      </div>

      <div className="mt-4">{renderActiveSection()}</div>
    </section>
  );

  function renderActiveSection(): ReactNode {
    switch (activeSection) {
      case "overview":
        return (
          <SectionCard
            title={copy.overviewTitle}
            description={copy.overviewDescription}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <StatusMetricCard
                title={copy.metricTitles.indexedFiles}
                value={String(fileIndexStatus?.indexedCount ?? 0)}
                detail={copy.metricDetails.indexedFiles}
              />
              <StatusMetricCard
                title={copy.metricTitles.clipboard}
                value={String(clipboardCount)}
                detail={copy.metricDetails.clipboard}
              />
              <StatusMetricCard
                title={copy.metricTitles.snippets}
                value={String(snippets.length)}
                detail={copy.metricDetails.snippets}
              />
              <StatusMetricCard
                title={copy.metricTitles.plugins}
                value={String(plugins.length)}
                detail={copy.metricDetails.plugins}
              />
              <StatusMetricCard
                title={copy.metricTitles.workflow}
                value={copy.metricDedicated}
                detail={copy.metricDetails.workflow}
              />
              <StatusMetricCard
                title={copy.metricTitles.permPrompts}
                value={String(permissionRequests.length)}
                detail={copy.metricDetails.permPrompts}
              />
            </div>

            <p className="mt-4 text-sm text-[color:var(--shell-text-secondary)]">
              {copy.overviewFooter}
            </p>
          </SectionCard>
        );

      case "general":
        return (
          <div className="space-y-4">
            <SectionCard
              title={copy.general.title}
              description={copy.general.description}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={copy.general.language}>
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
                    <option value="system">{copy.general.followSystem}</option>
                    <option value="en-US">{copy.general.english}</option>
                    <option value="zh-CN">{copy.general.simplifiedChinese}</option>
                  </select>
                </Field>

                <Field label={copy.general.maxResults}>
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

                <Field label={copy.general.defaultWebEngine}>
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
              title={copy.general.hotkeyTitle}
              description={copy.general.hotkeyDescription}
            >
              <Field label={copy.general.launcherHotkey}>
                <input
                  type="text"
                  value={draft.hotkey}
                  onChange={(event) => setDraft({ ...draft, hotkey: event.target.value })}
                  className={inputClassName}
                />
              </Field>
              <p className="mt-2 text-sm text-slate-400">
                {copy.general.hotkeyTodo}
              </p>
            </SectionCard>
          </div>
        );

      case "search":
        return (
          <SectionCard
            title={copy.search.title}
            description={copy.search.description}
          >
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatusMetricCard
                title={copy.search.fileIndex}
                value={formatIndexStateLabel(fileIndexStatus?.state, useChineseCopy)}
                detail={
                  fileIndexStatus?.message ?? copy.search.fileIndexFallback
                }
              />
              <StatusMetricCard
                title={copy.search.indexedFiles}
                value={String(fileIndexStatus?.indexedCount ?? 0)}
                detail={
                  fileIndexStatus?.truncated
                    ? copy.search.indexedFilesCap(fileIndexStatus.maxIndexedFiles)
                    : copy.search.indexedFilesDirectories(
                        fileIndexStatus?.indexedPaths.length ?? 0
                      )
                }
              />
              <StatusMetricCard
                title={copy.search.lastRebuild}
                value={formatTimestamp(fileIndexStatus?.lastIndexedAt)}
                detail={copy.search.lastRebuildDetail}
              />
              <StatusMetricCard
                title={copy.search.fileRanking}
                value={copy.search.fileRankingValue}
                detail={copy.search.fileRankingDetail}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SOURCE_WEIGHT_FIELDS.map((source) => (
                <Field key={source} label={getSourceWeightLabel(source, useChineseCopy)}>
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
              {copy.search.rankingNote}
            </p>
          </SectionCard>
        );

      case "clipboard":
        return (
          <SectionCard
            title={copy.clipboard.title}
            description={copy.clipboard.description}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={copy.clipboard.storedItems}>
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

              <Field label={copy.clipboard.pollInterval}>
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

              <Field label={copy.clipboard.currentItems}>
                <div className={staticFieldClassName}>{clipboardCount}</div>
              </Field>
            </div>

            <Field label={copy.clipboard.privateApps}>
              <textarea
                value={privateAppsDraft}
                onChange={(event) => setPrivateAppsDraft(event.target.value)}
                rows={4}
                className={textareaClassName}
                placeholder={copy.clipboard.privateAppsPlaceholder}
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
                {copy.clipboard.clearHistory}
              </button>
              <span className="text-sm text-slate-400">
                {copy.clipboard.privacyTodo}
              </span>
            </div>
          </SectionCard>
        );

      case "indexing":
        return (
          <SectionCard
            title={copy.indexing.title}
            description={copy.indexing.description}
          >
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatusMetricCard
                title={copy.indexing.state}
                value={formatIndexStateLabel(fileIndexStatus?.state, useChineseCopy)}
                detail={
                  fileIndexStatus?.lastError ??
                  fileIndexStatus?.message ??
                  copy.search.fileIndexFallback
                }
              />
              <StatusMetricCard
                title={copy.indexing.indexedEntries}
                value={String(fileIndexStatus?.indexedCount ?? 0)}
                detail={
                  fileIndexStatus?.truncated
                    ? copy.indexing.indexedEntriesCap(fileIndexStatus.maxIndexedFiles)
                    : copy.indexing.indexedEntriesBelowCap
                }
              />
              <StatusMetricCard
                title={copy.indexing.directories}
                value={String(draft.indexPaths.length || fileIndexStatus?.indexedPaths.length || 0)}
                detail={copy.indexing.directoriesDetail}
              />
              <StatusMetricCard
                title={copy.indexing.lastRebuild}
                value={formatTimestamp(fileIndexStatus?.lastIndexedAt)}
                detail={
                  draft.indexingPaused
                    ? copy.indexing.lastRebuildPaused
                    : copy.indexing.lastRebuildReady
                }
              />
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <ToggleRow
                label={copy.indexing.pauseAutomaticIndexing}
                checked={draft.indexingPaused}
                onChange={(checked) =>
                  setDraft({
                    ...draft,
                    indexingPaused: checked
                  })
                }
              />
              <div className="rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3 text-sm text-[color:var(--shell-text-secondary)]">
                {copy.indexing.rebuildNotice}
              </div>
            </div>

            <Field label={copy.indexing.indexedDirectories}>
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
                      {copy.indexing.remove}
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
                {copy.indexing.addDirectory}
              </button>
            </div>

            <Field label={copy.indexing.excludedPaths}>
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
                      {copy.indexing.remove}
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
                {copy.indexing.addExclusion}
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
                {copy.indexing.rebuildIndex}
              </button>
              <div className="text-sm text-[color:var(--shell-text-secondary)]">
                {copy.indexing.implicitIgnores}: <code>.git</code>, <code>node_modules</code>,{" "}
                <code>target</code>, <code>Library</code>, <code>.cache</code>.
              </div>
            </div>

            <p className="mt-3 text-sm text-[color:var(--shell-text-secondary)]">
              {copy.indexing.currentStatus(
                formatIndexStateLabel(fileIndexStatus?.state, useChineseCopy),
                fileIndexStatus?.indexedCount ?? 0,
                fileIndexStatus?.indexedPaths.length ?? draft.indexPaths.length,
                fileIndexStatus?.excludedPaths.length ?? draft.indexExclusions.length
              )}
            </p>

            {fileIndexStatus?.lastError ? (
              <p className="mt-2 text-sm text-amber-200">
                {copy.indexing.lastError}: {fileIndexStatus.lastError}
              </p>
            ) : null}
          </SectionCard>
        );

      case "snippets":
        return (
          <SectionCard
            title={copy.snippets.title}
            description={copy.snippets.description}
          >
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <ToggleRow
                label={copy.snippets.showInSearch}
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
                label={copy.snippets.enableHooks}
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
              {copy.snippets.variablesNote}
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
                  {copy.snippets.newSnippet}
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
                  <Field label={copy.snippets.name}>
                    <input
                      type="text"
                      value={snippetDraft.name}
                      onChange={(event) =>
                        setSnippetDraft({ ...snippetDraft, name: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </Field>

                  <Field label={copy.snippets.trigger}>
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

                <Field label={copy.snippets.content}>
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
                  <Field label={copy.snippets.scope}>
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

                  <Field label={copy.snippets.appRestriction}>
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
                  label={copy.snippets.enabled}
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
                    {savingSnippet ? copy.saving : copy.snippets.saveSnippet}
                  </button>
                  {snippetDraft.id ? (
                    <button
                      type="button"
                      className={secondaryButtonClassName}
                      onClick={() => {
                        void handleDeleteSnippet(snippetDraft.id!);
                      }}
                    >
                      {copy.snippets.deleteSnippet}
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
            title={copy.plugins.title}
            description={copy.plugins.description}
          >
            <div className="space-y-3">
              <ToggleRow
                label={copy.plugins.enableHost}
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
                label={copy.plugins.promptOnFirstPermission}
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
              <Field label={copy.plugins.timeout}>
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
                    {copy.plugins.pendingPrompts}
                  </div>
                  <div className="space-y-3">
                    {permissionRequests.map((request) => (
                      <div
                        key={`${request.pluginId}:${request.permission}`}
                        className="rounded-2xl border border-white/8 bg-black/20 p-3"
                      >
                        <div className="text-sm text-white">
                          {copy.plugins.requestsPermission(
                            request.pluginName
                          )}{" "}
                          <code>{request.permission}</code>
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
                            {copy.plugins.grant}
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
                            {copy.plugins.dismiss}
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
                            {formatPluginStatusLabel(plugin.status, useChineseCopy)}
                          </div>
                          <button
                            type="button"
                            className={secondaryButtonClassName}
                            onClick={() => {
                              void onTogglePluginEnabled(plugin.pluginId, !enabled);
                            }}
                          >
                            {enabled ? copy.plugins.disable : copy.plugins.enable}
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
                            {copy.plugins.permissions}
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
                                      {granted ? copy.plugins.granted : copy.plugins.notGranted}
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
                                        {copy.plugins.revoke}
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
                                        {copy.plugins.grant}
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
                          {copy.plugins.noPermissions}
                        </div>
                      )}

                      {plugin.validationErrors.length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/8 p-3 text-sm text-rose-100">
                          {plugin.validationErrors.join(" ")}
                        </div>
                      ) : null}

                      {plugin.lastError ? (
                        <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/8 p-3 text-sm text-amber-100">
                          {copy.plugins.lastHostError}: {plugin.lastError}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <p className="text-sm text-slate-400">
                {copy.plugins.sandboxTodo}
              </p>
            </div>
          </SectionCard>
        );

      case "appearance":
        return (
          <SectionCard
            title={copy.appearance.title}
            description={copy.appearance.description}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={copy.appearance.theme}>
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
                  <option value="system">{copy.appearance.system}</option>
                  <option value="light">{copy.appearance.light}</option>
                  <option value="dark">{copy.appearance.dark}</option>
                </select>
              </Field>

              <div className="space-y-3">
                <ToggleRow
                  label={copy.appearance.denseMode}
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
                  label={copy.appearance.reduceMotion}
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
              {copy.appearance.todo}
            </p>
          </SectionCard>
        );

      case "workflow":
        return (
          <SectionCard
            title={copy.workflow.title}
            description={copy.workflow.description}
          >
            <div className="space-y-3 text-sm text-slate-300">
              <p>{copy.workflow.intro}</p>
              <p>{copy.workflow.today}</p>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-slate-400">
                {copy.workflow.todo}
              </div>
            </div>
          </SectionCard>
        );

      case "marketplace":
        return (
          <MarketplacePanel
            installedPluginIds={plugins.map((p) => p.pluginId)}
            useChineseCopy={useChineseCopy}
            onPluginsChanged={() => {
              // Trigger a re-bootstrap to refresh plugin list
              // The parent component handles this via onClose + re-open
            }}
          />
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
