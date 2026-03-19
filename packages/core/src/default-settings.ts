import type { LauncherSettings } from "@osb/shared-types";

export const DEFAULT_SETTINGS: LauncherSettings = {
  hotkey: "Alt+Space",
  theme: "dark",
  language: "system",
  indexPaths: [],
  indexExclusions: [],
  indexingPaused: false,
  search: {
    maxResults: 9,
    sourceWeights: {
      apps: 1.2,
      files: 1,
      web: 0.75,
      clipboard: 0.95,
      snippets: 1.02,
      plugins: 0.9,
      workflows: 1.06,
      system: 0.85
    }
  },
  clipboard: {
    maxItems: 80,
    pollIntervalMs: 1200,
    privateApps: []
  },
  snippets: {
    enabledInSearch: true,
    enableExpansionHooks: false
  },
  plugins: {
    enableHost: true,
    timeoutMs: 1200,
    promptOnFirstPermission: true,
    disabledPluginIds: [],
    grantedPermissions: {}
  },
  appearance: {
    denseMode: false,
    reduceMotion: false
  },
  webSearch: {
    defaultEngine: "https://www.google.com/search?q={query}",
    shortcuts: {
      g: "https://www.google.com/search?q={query}",
      ddg: "https://duckduckgo.com/?q={query}",
      maps: "https://www.google.com/maps/search/{query}"
    }
  }
};
