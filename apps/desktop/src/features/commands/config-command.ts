export type ConfigSection =
  | "overview"
  | "general"
  | "search"
  | "clipboard"
  | "indexing"
  | "snippets"
  | "plugins"
  | "appearance"
  | "workflow";

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
  "appearance",
  "workflow"
] as const satisfies ConfigSection[];

export const CONFIG_SECTION_META: Record<ConfigSection, ConfigSectionMeta> = {
  overview: {
    label: "Overview",
    labelZh: "总览",
    command: "config overview",
    summary:
      "View the running status of each launcher module at a glance.",
    summaryZh: "查看启动器各模块的运行概况。",
    intro:
      "Overview centralizes status cards so each settings page can stay focused on its own controls.",
    introZh:
      "总览集中展示各模块的状态卡片，让具体配置页只关注各自的控制项。"
  },
  general: {
    label: "General",
    labelZh: "常规",
    command: "config general",
    summary:
      "Launcher defaults, language, and how the bar appears or dismisses.",
    summaryZh: "启动器默认行为、语言，以及 bar 的展示与收起方式。",
    intro:
      "Use this section for launcher-wide behavior such as language, entry points, dismissal rules, and baseline interaction across platforms.",
    introZh:
      "这里用于配置整个启动器的基础行为，包括语言、入口方式、关闭规则，以及跨平台的基础交互。"
  },
  search: {
    label: "Search",
    labelZh: "搜索",
    command: "config search",
    summary: "Source weights, result limits, and ranking settings.",
    summaryZh: "搜索来源权重和结果数量设置。",
    intro:
      "Search controls ranking, source weighting, file indexing roots, and how usage history influences result order.",
    introZh:
      "搜索页负责排序、来源权重、文件索引根目录，以及使用历史如何影响结果顺序。"
  },
  clipboard: {
    label: "Clipboard",
    labelZh: "剪贴板",
    command: "config clipboard",
    summary: "Clipboard retention, privacy exclusions, and repeat-copy behavior.",
    summaryZh: "管理剪贴板保留策略、隐私排除项和重复复制相关行为。",
    intro:
      "Clipboard settings tune local retention, privacy exclusions, and platform hooks behind repeat copy and paste simulation.",
    introZh:
      "剪贴板页用于调整本地保留策略、隐私排除应用，以及重复复制与粘贴模拟相关的平台能力。"
  },
  snippets: {
    label: "Snippets",
    labelZh: "片段",
    command: "config snippets",
    summary: "Manage snippets and text expansion settings.",
    summaryZh: "管理片段和文本展开设置。",
    intro:
      "Snippets manage saved expansions, variables, and how reusable text appears in launcher search.",
    introZh:
      "片段页管理已保存的扩展文本、变量，以及这些可复用文本如何出现在搜索结果中。"
  },
  plugins: {
    label: "Plugins",
    labelZh: "插件",
    command: "config plugins",
    summary: "Plugin runtime state and permission management.",
    summaryZh: "插件运行状态和权限管理。",
    intro:
      "Plugins covers runtime state, permission approval, timeout behavior, enable/disable controls, and discovering new plugins.",
    introZh: "插件页覆盖运行状态、权限审批、超时行为、启用/禁用控制，以及发现新插件。"
  },
  appearance: {
    label: "Appearance",
    labelZh: "外观",
    command: "config appearance",
    summary: "Theme and display density settings.",
    summaryZh: "主题和显示密度设置。",
    intro:
      "Appearance tunes the visual language per platform so Windows, Linux, and macOS stay consistent in behavior.",
    introZh:
      "外观页用于按平台调节视觉语言，让 Windows、Linux 和 macOS 在行为一致的同时保留各自风格。"
  },
  workflow: {
    label: "Workflow",
    labelZh: "工作流",
    command: "config workflow",
    summary: "Workflow automation settings.",
    summaryZh: "工作流自动化设置。",
    intro:
      "Workflow opens its own dedicated surface. This is where higher-level command composition will live.",
    introZh:
      "工作流拥有独立的专用界面，承载更高层级的命令编排能力。"
  },
  indexing: {
    label: "Indexing",
    labelZh: "索引",
    command: "config indexing",
    summary: "Manage file search index directories and exclusions.",
    summaryZh: "管理文件搜索的索引目录和排除项。",
    intro:
      "Indexing stays reachable as a direct command, but the primary surface now lives under Search.",
    introZh: "索引仍可通过独立命令直接进入，不过主要的产品入口现在放在搜索页下。"
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
  marketplace: "plugins",
  market: "plugins",
  store: "plugins",
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
  if (command !== "/config" && command !== "config" && command !== "/settings") {
    return null;
  }

  const rawSection = parts[1];
  return {
    section: rawSection ? (SECTION_ALIASES[rawSection] ?? "overview") : "overview",
    rawSection
  };
}
