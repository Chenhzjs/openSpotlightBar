export type ConfigSection =
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

export const CONFIG_HUB_SECTIONS = [
  "general",
  "search",
  "clipboard",
  "snippets",
  "plugins",
  "appearance",
  "workflow"
] as const satisfies ConfigSection[];

export const CONFIG_SECTION_META: Record<
  ConfigSection,
  {
    label: string;
    command: string;
    summary: string;
    intro: string;
  }
> = {
  general: {
    label: "General",
    command: "/config general",
    summary: "Launcher defaults, language, shell behavior, and how the bar appears or dismisses.",
    intro:
      "Use this section for launcher-wide behavior such as language, entry points, dismissal rules, and the baseline shell behavior across platforms."
  },
  search: {
    label: "Search",
    command: "/config search",
    summary: "Ranking, file indexing, and provider balance across local-first sources.",
    intro:
      "Search owns ranking, provider weighting, file indexing roots, and how usage history influences result order. It is the main tuning surface for retrieval quality."
  },
  clipboard: {
    label: "Clipboard",
    command: "/config clipboard",
    summary: "Clipboard retention, privacy exclusions, and repeat-copy behavior.",
    intro:
      "Clipboard settings tune local retention, privacy exclusions, and the platform hooks behind repeat copy and future paste simulation."
  },
  snippets: {
    label: "Snippets",
    command: "/config snippets",
    summary: "Snippet records, variables, and future expansion hooks.",
    intro:
      "Snippets manage saved expansions, variables, and how reusable text appears in launcher search before global expansion hooks land."
  },
  plugins: {
    label: "Plugins",
    command: "/config plugins",
    summary: "Plugin runtime state, permissions, and timeout behavior.",
    intro:
      "Plugins covers worker runtime state, permission approval, timeout behavior, and enable or disable controls."
  },
  appearance: {
    label: "Appearance",
    command: "/config appearance",
    summary: "Platform-adapted shell look, density, and visual hierarchy.",
    intro:
      "Appearance tunes the shell's visual language per platform so Windows, Linux, and macOS stay consistent in behavior without looking identical."
  },
  workflow: {
    label: "Workflow",
    command: "/config workflow",
    summary: "Workflow composition foundation and future automation surface.",
    intro:
      "Workflow should open its own dedicated surface instead of bloating the launcher bar. This is where higher-level command composition will live."
  },
  indexing: {
    label: "Indexing",
    command: "/config indexing",
    summary: "Direct route into file indexing controls.",
    intro:
      "Indexing stays reachable as a direct command, but the primary product surface now lives under Search."
  }
};

const SECTION_ALIASES: Record<string, ConfigSection> = {
  appearance: "appearance",
  clipboard: "clipboard",
  general: "general",
  hotkey: "general",
  indexing: "indexing",
  plugin: "plugins",
  plugins: "plugins",
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
    section: rawSection ? (SECTION_ALIASES[rawSection] ?? "general") : "general",
    rawSection
  };
}
