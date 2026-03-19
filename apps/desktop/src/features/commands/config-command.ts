export type ConfigSection =
  | "overview"
  | "general"
  | "search"
  | "clipboard"
  | "indexing"
  | "snippets"
  | "plugins"
  | "appearance"
  | "workflow"
  | "marketplace";

export interface ConfigCommand {
  section: ConfigSection;
  rawSection?: string;
}

interface ConfigSectionMeta {
  label: string;
  labelZh: string;
  command: string;
  summary: string;
  summaryZh: string;
  intro: string;
  introZh: string;
}

export const CONFIG_HUB_SECTIONS = [
  "overview",
  "general",
  "search",
  "clipboard",
  "snippets",
  "plugins",
  "marketplace",
  "appearance",
  "workflow"
] as const satisfies ConfigSection[];

export const CONFIG_SECTION_META: Record<ConfigSection, ConfigSectionMeta> = {
  overview: {
    label: "Overview",
    labelZh: "总览",
    command: "/config overview",
    summary: "Launcher-wide snapshot for file index, clipboard, snippets, plugins, workflow, and permission health.",
    summaryZh: "集中查看文件索引、剪贴板、片段、插件、工作流和权限请求的全局状态。",
    intro:
      "Overview centralizes the cross-launcher counts and status cards so the task-specific sections can stay focused on their own controls.",
    introZh:
      "总览集中展示整个启动器的关键计数和状态卡片，让具体配置页只关注各自的控制项。"
  },
  general: {
    label: "General",
    labelZh: "常规",
    command: "/config general",
    summary: "Launcher defaults, language, shell behavior, and how the bar appears or dismisses.",
    summaryZh: "启动器默认行为、语言、外壳交互，以及 bar 的展示与收起方式。",
    intro:
      "Use this section for launcher-wide behavior such as language, entry points, dismissal rules, and the baseline shell behavior across platforms.",
    introZh:
      "这里用于配置整个启动器的基础行为，包括语言、入口方式、关闭规则，以及跨平台的基础交互。"
  },
  search: {
    label: "Search",
    labelZh: "搜索",
    command: "/config search",
    summary: "Ranking, file indexing, and provider balance across local-first sources.",
    summaryZh: "调节排序、文件索引和各类本地优先数据源之间的权重平衡。",
    intro:
      "Search owns ranking, provider weighting, file indexing roots, and how usage history influences result order. It is the main tuning surface for retrieval quality.",
    introZh:
      "搜索页负责排序、Provider 权重、文件索引根目录，以及使用历史如何影响结果顺序，是检索质量的主要调优入口。"
  },
  clipboard: {
    label: "Clipboard",
    labelZh: "剪贴板",
    command: "/config clipboard",
    summary: "Clipboard retention, privacy exclusions, and repeat-copy behavior.",
    summaryZh: "管理剪贴板保留策略、隐私排除项和重复复制相关行为。",
    intro:
      "Clipboard settings tune local retention, privacy exclusions, and the platform hooks behind repeat copy and future paste simulation.",
    introZh:
      "剪贴板页用于调整本地保留策略、隐私排除应用，以及重复复制与后续粘贴模拟相关的平台能力。"
  },
  snippets: {
    label: "Snippets",
    labelZh: "片段",
    command: "/config snippets",
    summary: "Snippet records, variables, and future expansion hooks.",
    summaryZh: "管理片段记录、变量能力以及未来的展开钩子。",
    intro:
      "Snippets manage saved expansions, variables, and how reusable text appears in launcher search before global expansion hooks land.",
    introZh:
      "片段页管理已保存的扩展文本、变量，以及在全局展开钩子完成之前这些可复用文本如何出现在搜索结果中。"
  },
  plugins: {
    label: "Plugins",
    labelZh: "插件",
    command: "/config plugins",
    summary: "Plugin runtime state, permissions, and timeout behavior.",
    summaryZh: "查看插件运行状态、权限授予情况以及超时策略。",
    intro:
      "Plugins covers worker runtime state, permission approval, timeout behavior, and enable or disable controls.",
    introZh:
      "插件页覆盖 worker 运行状态、权限审批、超时行为，以及启用和禁用控制。"
  },
  marketplace: {
    label: "Marketplace",
    labelZh: "插件市场",
    command: "/config marketplace",
    summary: "Browse, install, and manage community plugins from the online registry.",
    summaryZh: "浏览、安装和管理来自在线注册表的社区插件。",
    intro:
      "Marketplace connects to a remote plugin registry so you can discover, install, and uninstall community plugins without leaving the launcher.",
    introZh:
      "插件市场连接远程插件注册表，让你无需离开启动器即可发现、安装和卸载社区插件。"
  },
  appearance: {
    label: "Appearance",
    labelZh: "外观",
    command: "/config appearance",
    summary: "Platform-adapted shell look, density, and visual hierarchy.",
    summaryZh: "调整外壳在不同平台上的外观、密度和视觉层级。",
    intro:
      "Appearance tunes the shell's visual language per platform so Windows, Linux, and macOS stay consistent in behavior without looking identical.",
    introZh:
      "外观页用于按平台调节 shell 的视觉语言，让 Windows、Linux 和 macOS 在行为一致的同时保留各自风格。"
  },
  workflow: {
    label: "Workflow",
    labelZh: "工作流",
    command: "/config workflow",
    summary: "Workflow composition foundation and future automation surface.",
    summaryZh: "管理工作流编排基础能力，以及后续自动化入口。",
    intro:
      "Workflow should open its own dedicated surface instead of bloating the launcher bar. This is where higher-level command composition will live.",
    introZh:
      "工作流应当拥有独立的专用界面，而不是把启动器 bar 塞满。这一页承载更高层级的命令编排能力。"
  },
  indexing: {
    label: "Indexing",
    labelZh: "索引",
    command: "/config indexing",
    summary: "Direct route into file indexing controls.",
    summaryZh: "直接进入文件索引控制。",
    intro:
      "Indexing stays reachable as a direct command, but the primary product surface now lives under Search.",
    introZh:
      "索引仍可通过独立命令直接进入，不过主要的产品入口现在放在搜索页下。"
  }
};

export function getConfigSectionMeta(section: ConfigSection, useChineseCopy: boolean) {
  const meta = CONFIG_SECTION_META[section];
  return {
    command: meta.command,
    label: useChineseCopy ? meta.labelZh : meta.label,
    summary: useChineseCopy ? meta.summaryZh : meta.summary,
    intro: useChineseCopy ? meta.introZh : meta.intro
  };
}

const SECTION_ALIASES: Record<string, ConfigSection> = {
  appearance: "appearance",
  clipboard: "clipboard",
  general: "general",
  hotkey: "general",
  indexing: "indexing",
  overview: "overview",
  home: "overview",
  summary: "overview",
  plugin: "plugins",
  plugins: "plugins",
  marketplace: "marketplace",
  market: "marketplace",
  store: "marketplace",
  search: "search",
  snippet: "snippets",
  snippets: "snippets",
  theme: "appearance",
  workflow: "workflow",
  workflows: "workflow"
};

export function parseConfigCommand(input: string): ConfigCommand | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  if (command !== "/config" && command !== "/settings") {
    return null;
  }

  const rawSection = parts[1];
  return {
    section: rawSection ? (SECTION_ALIASES[rawSection] ?? "overview") : "overview",
    rawSection
  };
}
