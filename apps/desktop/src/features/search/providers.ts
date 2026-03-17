import { parseQuery } from "@pulse/core";
import type {
  ActionItem,
  AppRecord,
  ClipboardItem,
  FileRecord,
  ResultItem,
  SearchContext,
  SearchProvider,
  SearchScope,
  SnippetRecord
} from "@pulse/shared-types";

import type { PluginHost } from "../plugins/plugin-host";

import { searchApps, searchFiles } from "../../lib/backend";

const SEARCHABLE_SCOPES: SearchScope[] = [
  "all",
  "apps",
  "files",
  "clipboard",
  "snippets",
  "plugins",
  "system"
];

export function createProviders(pluginHost: PluginHost): SearchProvider[] {
  return [
    createSystemProvider(),
    createAppProvider(),
    createFileProvider(),
    createClipboardProvider(),
    createSnippetProvider(),
    createPluginProvider(pluginHost),
    createWebProvider()
  ];
}

function createSystemProvider(): SearchProvider {
  return {
    id: "system",
    label: "System commands",
    source: "system",
    sourceWeight: 0.68,
    async search(query, context) {
      if (!SEARCHABLE_SCOPES.includes(context.scope)) {
        return [];
      }

      const normalized = query.trim().toLowerCase();
      const results: ResultItem[] = [];

      if (
        shouldOfferSystemResult(context.scope, "system") &&
        matchesKeywordGroup(
          normalized,
          ["settings", "preferences", "prefs", "config"],
          true
        )
      ) {
        results.push({
          id: "system:settings",
          title: "Open settings",
          subtitle: "General, search, clipboard, snippets, plugins, appearance",
          type: "system",
          source: "system",
          score: 0.78,
          payload: {},
          actions: [
            {
              id: "show-settings",
              title: "Open settings",
              kind: "show-settings",
              shortcut: "Enter"
            }
          ]
        });
      }

      if (
        shouldOfferSystemResult(context.scope, "system") &&
        matchesKeywordGroup(
          normalized,
          ["reindex", "index", "rescan", "refresh index"],
          true
        )
      ) {
        results.push({
          id: "system:reindex",
          title: "Rebuild file index",
          subtitle: "Refresh the lightweight filename and path cache",
          type: "system",
          source: "system",
          score: 0.72,
          payload: {},
          actions: [
            {
              id: "rebuild-file-index",
              title: "Rebuild file index",
              kind: "rebuild-file-index",
              shortcut: "Enter"
            }
          ]
        });
      }

      if (
        context.clipboardItems.length > 0 &&
        (context.scope === "clipboard" || context.scope === "system") &&
        matchesKeywordGroup(
          normalized,
          ["clear", "clear clipboard", "clear history"],
          true
        )
      ) {
        results.push({
          id: "system:clear-clipboard",
          title: "Clear clipboard history",
          subtitle: "Delete all locally stored clipboard entries",
          type: "system",
          source: "system",
          score: 0.66,
          payload: {},
          actions: [
            {
              id: "clear-clipboard-history",
              title: "Clear clipboard history",
              kind: "clear-clipboard-history",
              shortcut: "Enter"
            }
          ]
        });
      }

      return results;
    }
  };
}

function createAppProvider(): SearchProvider {
  return {
    id: "apps",
    label: "Applications",
    source: "apps",
    sourceWeight: 1.2,
    async search(query, context) {
      if (!shouldSearch(context, "apps") || query.trim().length < 1) {
        return [];
      }

      const apps = await searchApps(query);
      return apps.map((app) => toAppResult(app));
    }
  };
}

function createFileProvider(): SearchProvider {
  return {
    id: "files",
    label: "Files",
    source: "files",
    sourceWeight: 1,
    timeoutMs: 800,
    async search(query, context) {
      if (!shouldSearch(context, "files") || query.trim().length < 2) {
        return [];
      }

      const files = await searchFiles(query);
      return files.map((file) => toFileResult(file));
    }
  };
}

function createClipboardProvider(): SearchProvider {
  return {
    id: "clipboard",
    label: "Clipboard history",
    source: "clipboard",
    sourceWeight: 0.95,
    async search(query, context) {
      if (!shouldSearch(context, "clipboard") || context.clipboardItems.length === 0) {
        return [];
      }

      const normalized = query.trim().toLowerCase();
      const showAll = context.scope === "clipboard" && normalized.length === 0;
      if (!showAll && context.scope === "all" && normalized.length < 2) {
        return [];
      }

      return context.clipboardItems
        .filter((item) => showAll || matchesClipboardItem(item, normalized))
        .slice(0, 12)
        .map((item) => toClipboardResult(item));
    }
  };
}

function createSnippetProvider(): SearchProvider {
  return {
    id: "snippets",
    label: "Snippets",
    source: "snippets",
    sourceWeight: 1.02,
    async search(query, context) {
      if (!shouldSearch(context, "snippets") || context.snippets.length === 0) {
        return [];
      }

      if (!context.settings.snippets.enabledInSearch && context.scope !== "snippets") {
        return [];
      }

      const normalized = query.trim().toLowerCase();
      const showAll = context.scope === "snippets" && normalized.length === 0;
      if (!showAll && context.scope === "all" && normalized.length < 1) {
        return [];
      }

      return context.snippets
        .filter((snippet) => snippet.enabled)
        .filter((snippet) => showAll || matchesSnippet(snippet, normalized))
        .slice(0, 12)
        .map((snippet) => toSnippetResult(snippet));
    }
  };
}

function createWebProvider(): SearchProvider {
  return {
    id: "web",
    label: "Web search",
    source: "web",
    sourceWeight: 0.75,
    async search(query, context) {
      if (context.scope !== "all") {
        return [];
      }

      const trimmed = query.trim();
      if (!trimmed) {
        return [];
      }

      const tokens = trimmed.split(/\s+/);
      const alias = tokens[0];
      const shortcutTemplate = context.settings.webSearch.shortcuts[alias];
      const actualQuery = shortcutTemplate ? tokens.slice(1).join(" ") : trimmed;
      if (!actualQuery) {
        return [];
      }

      const template = shortcutTemplate ?? context.settings.webSearch.defaultEngine;
      const url = template.replace("{query}", encodeURIComponent(actualQuery));
      const title = shortcutTemplate
        ? `Search ${alias}: ${actualQuery}`
        : `Search the web for ${actualQuery}`;

      return [
        {
          id: `web:${url}`,
          title,
          subtitle: url,
          type: "url",
          source: "web",
          score: shortcutTemplate ? 0.88 : 0.54,
          payload: {
            url
          },
          actions: [
            {
              id: "search-web",
              title: "Search on web",
              kind: "search-web",
              shortcut: "Enter",
              payload: { url }
            }
          ]
        }
      ];
    }
  };
}

function createPluginProvider(pluginHost: PluginHost): SearchProvider {
  return {
    id: "plugins",
    label: "Plugins",
    source: "plugins",
    sourceWeight: 0.9,
    timeoutMs: 900,
    async search(query, context) {
      if (!shouldSearch(context, "plugins")) {
        return [];
      }

      if (!context.settings.plugins.enableHost) {
        return [];
      }

      if (query.trim().length < 1) {
        return [];
      }

      return pluginHost.search(query, context);
    }
  };
}

function shouldSearch(context: SearchContext, scope: SearchScope): boolean {
  return context.scope === "all" || context.scope === scope;
}

function shouldOfferSystemResult(
  currentScope: SearchScope,
  requiredScope: SearchScope
): boolean {
  return currentScope === "all" || currentScope === requiredScope;
}

function matchesKeywordGroup(
  query: string,
  keywords: string[],
  allowOnEmpty = false
): boolean {
  if (!query) {
    return allowOnEmpty;
  }

  return keywords.some((keyword) => keyword.includes(query) || query.includes(keyword));
}

function matchesClipboardItem(item: ClipboardItem, query: string): boolean {
  const haystack = [item.preview, item.text, item.sourceApp]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesSnippet(snippet: SnippetRecord, query: string): boolean {
  const haystack = [
    snippet.name,
    snippet.trigger,
    snippet.content,
    snippet.scope,
    snippet.appRestriction
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function toAppResult(app: AppRecord): ResultItem {
  return {
    id: `app:${app.id}`,
    title: app.name,
    subtitle: app.path,
    type: "app",
    source: "apps",
    score: 0.95,
    payload: {
      path: app.path,
      launchTarget: app.launchTarget ?? app.path,
      launchTargetType: app.launchTargetType ?? "path"
    },
    actions: [
      {
        id: "launch-app",
        title: "Launch app",
        kind: "launch-app",
        shortcut: "Enter",
        payload: {
          launchTarget: app.launchTarget ?? app.path,
          launchTargetType: app.launchTargetType ?? "path",
          path: app.path
        }
      },
      {
        id: "reveal-app",
        title: "Reveal app bundle",
        kind: "reveal-in-folder",
        payload: {
          path: app.path
        }
      },
      {
        id: "copy-path",
        title: "Copy path",
        kind: "copy-path",
        payload: {
          path: app.path
        }
      }
    ]
  };
}

function toFileResult(file: FileRecord): ResultItem {
  return {
    id: `file:${file.path}`,
    title: file.name,
    subtitle: file.path,
    type: file.kind,
    source: "files",
    score: 0.82,
    payload: {
      path: file.path,
      kind: file.kind
    },
    actions: [
      {
        id: "open-path",
        title: "Open",
        kind: "open-path",
        shortcut: "Enter",
        payload: { path: file.path }
      },
      {
        id: "reveal-in-folder",
        title: "Reveal in folder",
        kind: "reveal-in-folder",
        payload: { path: file.path }
      },
      {
        id: "copy-path",
        title: "Copy path",
        kind: "copy-path",
        payload: { path: file.path }
      },
      {
        id: "open-in-terminal",
        title: "Open in terminal",
        kind: "open-in-terminal",
        payload: { path: file.path }
      }
    ]
  };
}

function toClipboardResult(item: ClipboardItem): ResultItem {
  const text = item.text ?? item.preview;
  const pinAction: ActionItem = item.pinned
    ? {
        id: `unpin:${item.id}`,
        title: "Unpin item",
        kind: "unpin-clipboard-item",
        payload: { itemId: item.id }
      }
    : {
        id: `pin:${item.id}`,
        title: "Pin item",
        kind: "pin-clipboard-item",
        payload: { itemId: item.id }
      };

  return {
    id: `clipboard:${item.id}`,
    title: item.preview,
    subtitle: [
      item.pinned ? "Pinned" : null,
      item.sourceApp,
      formatRelativeTime(item.createdAt)
    ]
      .filter(Boolean)
      .join(" • "),
    type: "clipboard",
    source: "clipboard",
    score: item.pinned ? 0.94 : 0.8,
    tags: item.pinned ? ["pinned"] : undefined,
    payload: {
      itemId: item.id,
      text,
      contentType: item.contentType
    },
    actions: [
      {
        id: `copy:${item.id}`,
        title: "Copy again",
        kind: "copy-text",
        shortcut: "Enter",
        payload: { text }
      },
      {
        id: `paste:${item.id}`,
        title: "Paste item",
        kind: "paste-text",
        description: "TODO: native paste simulation hooks land in a later phase.",
        payload: { text }
      },
      pinAction,
      {
        id: `delete:${item.id}`,
        title: "Delete item",
        kind: "delete-clipboard-item",
        payload: { itemId: item.id }
      }
    ]
  };
}

function toSnippetResult(snippet: SnippetRecord): ResultItem {
  return {
    id: `snippet:${snippet.id}`,
    title: snippet.name,
    subtitle: `${snippet.trigger} • ${snippet.content.slice(0, 80)}`,
    type: "snippet",
    source: "snippets",
    score: 0.87,
    tags: [snippet.trigger],
    payload: {
      snippetId: snippet.id,
      trigger: snippet.trigger,
      text: snippet.content
    },
    actions: [
      {
        id: `expand:${snippet.id}`,
        title: "Expand snippet",
        kind: "expand-snippet",
        shortcut: "Enter",
        description: "Expands variables and copies the result for now.",
        payload: { snippetId: snippet.id }
      },
      {
        id: `copy-template:${snippet.id}`,
        title: "Copy template",
        kind: "copy-text",
        payload: { text: snippet.content }
      },
      {
        id: `paste-template:${snippet.id}`,
        title: "Paste template",
        kind: "paste-text",
        description: "TODO: hook into OS-level insertion when global expansion lands.",
        payload: { text: snippet.content }
      }
    ]
  };
}

function formatRelativeTime(createdAt: number): string {
  const deltaMs = Math.max(Date.now() - createdAt, 0);
  const deltaMinutes = Math.round(deltaMs / 60_000);

  if (deltaMinutes < 1) {
    return "just now";
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  return `${Math.round(deltaHours / 24)}d ago`;
}

export function getScopedInput(query: string): string {
  const parsed = parseQuery(query);
  return parsed.stripped || parsed.raw;
}

export function getDefaultAction(result?: ResultItem): ActionItem | undefined {
  return result?.actions[0];
}
