import type { SearchScope } from "@osb/shared-types";

export interface ParsedQuery {
  scope: SearchScope;
  raw: string;
  normalized: string;
  stripped: string;
  commandPrefix?: string;
}

const SCOPE_PREFIXES: Record<string, SearchScope> = {
  "app ": "apps",
  "apps ": "apps",
  "f ": "files",
  "file ": "files",
  "files ": "files",
  "clip ": "clipboard",
  "clipboard ": "clipboard",
  "snip ": "snippets",
  "snippet ": "snippets",
  "plugin ": "plugins",
  "plugins ": "plugins",
  "ext ": "plugins",
  "wf ": "workflows",
  "workflow ": "workflows",
  "workflows ": "workflows",
  "sys ": "system"
};

export function normalizeQuery(input: string): string {
  return input.trim().toLowerCase();
}

export function parseQuery(input: string): ParsedQuery {
  const trimmed = input.trim();
  const normalized = normalizeQuery(input);

  for (const [prefix, scope] of Object.entries(SCOPE_PREFIXES)) {
    if (normalized.startsWith(prefix)) {
      return {
        scope,
        raw: trimmed,
        normalized,
        stripped: trimmed.slice(prefix.length).trim(),
        commandPrefix: prefix.trim()
      };
    }
  }

  if (trimmed.startsWith(";")) {
    return {
      scope: "snippets",
      raw: trimmed,
      normalized,
      stripped: trimmed.slice(1).trim(),
      commandPrefix: ";"
    };
  }

  return {
    scope: "all",
    raw: trimmed,
    normalized,
    stripped: trimmed
  };
}
