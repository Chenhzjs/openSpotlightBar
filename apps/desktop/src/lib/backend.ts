import { DEFAULT_SETTINGS, getBuiltInWorkflows } from "@osb/core";
import type {
  ActionItem,
  ActionResponse,
  AppRecord,
  BootstrapPayload,
  ClipboardItem,
  DiscoveredPlugin,
  FileIndexStatus,
  FileRecord,
  LauncherSettings,
  MarketplaceEntry,
  ResultItem,
  SnippetInput,
  SnippetRecord,
  WorkflowHttpRequest,
  WorkflowHttpResponse,
  WorkflowRecord
} from "@osb/shared-types";

interface PluginShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let mockSettings: LauncherSettings = {
  ...DEFAULT_SETTINGS,
  indexPaths: ["~/Applications", "~/Documents", "~/Downloads"],
  indexExclusions: ["~/Downloads/Archives"],
  indexingPaused: false,
  plugins: {
    ...DEFAULT_SETTINGS.plugins,
    enableHost: true
  }
};

let mockIndexStatus: FileIndexStatus = {
  state: "ready",
  indexedCount: 342,
  indexedPaths: ["~/Applications", "~/Documents", "~/Downloads"],
  excludedPaths: ["~/Downloads/Archives"],
  lastIndexedAt: Date.now() - 180000,
  message: "Mock file index loaded for browser preview.",
  lastError: null,
  paused: false,
  truncated: false,
  maxIndexedFiles: 15_000
};

let mockClipboardItems: ClipboardItem[] = [
  {
    id: "clip-1",
    contentType: "text",
    text: "pnpm --dir apps/desktop exec tauri dev",
    preview: "pnpm --dir apps/desktop exec tauri dev",
    pinned: true,
    createdAt: Date.now() - 90_000,
    sourceApp: "Terminal",
    metadata: null
  },
  {
    id: "clip-2",
    contentType: "text",
    text: "Open Spotlight Bar architecture checklist",
    preview: "Open Spotlight Bar architecture checklist",
    pinned: false,
    createdAt: Date.now() - 15_000,
    sourceApp: "Notes",
    metadata: null
  }
];

let mockSnippets: SnippetRecord[] = [
  {
    id: "snippet-1",
    name: "Daily standup",
    trigger: ";standup",
    content: "Yesterday:\nToday:\nBlockers:\nGenerated at {{time}}",
    enabled: true,
    scope: null,
    appRestriction: null,
    createdAt: Date.now() - 86_400_000,
    updatedAt: Date.now() - 3_600_000
  }
];

let mockWorkflows: WorkflowRecord[] = getBuiltInWorkflows().map((workflow) =>
  cloneWorkflow(workflow)
);

const mockPlugins: DiscoveredPlugin[] = [
  {
    manifest: {
      id: "com.osb.calculator",
      name: "Calculator",
      version: "0.1.0",
      entry: "src/index.js",
      description: "Evaluate arithmetic expressions inline.",
      commands: [{ name: "=", title: "Calculate expression" }],
      permissions: []
    },
    rootPath: "/mock/plugins/calculator",
    entryPath: "/mock/plugins/calculator/src/index.js",
    entrySource: `
const plugin = {
  async search(context) {
    const raw = context.query.trim();
    const expression = raw.startsWith("=") ? raw.slice(1).trim() : raw;
    if (!expression || !/^[0-9+\\-*/().%\\s]+$/.test(expression)) {
      return [];
    }
    try {
      const value = safeEval(expression.replaceAll("%", "/100"));
      if (!Number.isFinite(value)) return [];
      return [{
        id: \`calculator:\${expression}\`,
        title: \`\${expression} = \${value}\`,
        subtitle: "Calculator plugin",
        type: "plugin",
        score: 1.08,
        payload: { text: String(value) },
        actions: [{
          id: "copy-result",
          title: "Copy result",
          kind: "copy-text",
          shortcut: "Enter",
          payload: { text: String(value) }
        }],
        tags: ["calculator"]
      }];
    } catch {
      return [];
    }
  }
};

function safeEval(expr) {
  let pos = 0;
  const ch = () => expr[pos] || "";
  const skip = () => { while (expr[pos] === " ") pos++; };

  function parseExpr() {
    let left = parseTerm();
    skip();
    while (ch() === "+" || ch() === "-") {
      const op = ch(); pos++;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
      skip();
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    skip();
    while (ch() === "*" || ch() === "/") {
      const op = ch(); pos++;
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
      skip();
    }
    return left;
  }

  function parseFactor() {
    skip();
    if (ch() === "(") {
      pos++;
      const val = parseExpr();
      if (ch() === ")") pos++;
      return val;
    }
    if (ch() === "-") {
      pos++;
      return -parseFactor();
    }
    const start = pos;
    while (/[0-9.]/.test(ch())) pos++;
    if (pos === start) throw new Error("Unexpected token");
    return parseFloat(expr.slice(start, pos));
  }

  const result = parseExpr();
  skip();
  if (pos < expr.length) throw new Error("Unexpected trailing input");
  return result;
}

export default plugin;
`.trim(),
    validationErrors: []
  },
  {
    manifest: {
      id: "com.osb.github",
      name: "GitHub Search",
      version: "0.1.0",
      entry: "src/index.js",
      description: "Open GitHub repository and code searches from the launcher.",
      commands: [{ name: "gh", title: "GitHub search" }],
      permissions: ["network"]
    },
    rootPath: "/mock/plugins/github",
    entryPath: "/mock/plugins/github/src/index.js",
    entrySource: `
const plugin = {
  async search(context, api) {
    const trimmed = context.query.trim();
    if (!trimmed.toLowerCase().startsWith("gh ")) {
      return [];
    }
    const query = trimmed.slice(3).trim();
    if (query.length < 2) {
      return [];
    }
    const response = await api.fetchJson(\`https://api.github.com/search/repositories?q=\${encodeURIComponent(query)}&per_page=5\`);
    const items = Array.isArray(response?.items) ? response.items : [];
    return items.map((item) => ({
      id: \`github:\${item.full_name}\`,
      title: item.full_name,
      subtitle: item.html_url,
      type: "url",
      score: 0.9,
      payload: { url: item.html_url },
      actions: [{
        id: "open-repository",
        title: "Open repository",
        kind: "open-url",
        shortcut: "Enter",
        payload: { url: item.html_url }
      }]
    }));
  }
};
export default plugin;
`.trim(),
    validationErrors: []
  },
  {
    manifest: {
      id: "com.osb.shell",
      name: "Shell Command",
      version: "0.1.0",
      entry: "src/index.js",
      description: "Run an ad-hoc shell command from the launcher.",
      commands: [{ name: ">", title: "Shell command" }],
      permissions: ["shell.exec"]
    },
    rootPath: "/mock/plugins/shell",
    entryPath: "/mock/plugins/shell/src/index.js",
    entrySource: `
const plugin = {
  async search(context) {
    const trimmed = context.query.trim();
    if (!trimmed.startsWith(">")) {
      return [];
    }
    const command = trimmed.slice(1).trim();
    if (!command) {
      return [];
    }
    return [{
      id: \`shell:\${command}\`,
      title: "Run shell command",
      subtitle: command,
      type: "command",
      score: 0.94,
      payload: { command },
      actions: [{
        id: "run-command",
        title: "Run command",
        kind: "run-plugin-action",
        shortcut: "Enter",
        requires: ["shell.exec"],
        payload: { command }
      }]
    }];
  },
  async runAction(actionId, payload, _context, api) {
    if (actionId !== "run-command") {
      return { ok: false, message: "Unsupported action." };
    }
    const result = await api.execShell(String(payload.command ?? ""));
    return { ok: result.exitCode === 0, message: (result.stdout || result.stderr).slice(0, 200) };
  }
};
export default plugin;
`.trim(),
    validationErrors: []
  }
];

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function bootstrapState(): Promise<BootstrapPayload> {
  if (!isTauriEnvironment()) {
    return {
      settings: cloneSettings(mockSettings),
      usageStats: [],
      fileIndexStatus: mockIndexStatus,
      clipboardItems: [...mockClipboardItems],
      snippets: [...mockSnippets],
      plugins: [...mockPlugins],
      workflows: mockWorkflows.map((workflow) => cloneWorkflow(workflow))
    };
  }

  return invokeCommand<BootstrapPayload>("bootstrap_state");
}

export async function searchApps(query: string): Promise<AppRecord[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        id: "mock-chrome",
        name: "Google Chrome",
        path: "/Applications/Google Chrome.app",
        launchTarget: "/Applications/Google Chrome.app",
        launchTargetType: "path" as const
      },
      {
        id: "mock-terminal",
        name: "Terminal",
        path: "/Applications/Utilities/Terminal.app",
        launchTarget: "/Applications/Utilities/Terminal.app",
        launchTargetType: "path" as const
      }
    ].filter((entry) => matchText(`${entry.name} ${entry.path}`, query));
  }

  return invokeCommand<AppRecord[]>("search_apps", { query });
}

export async function searchFiles(query: string): Promise<FileRecord[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        path: "/Users/demo/Documents/report.md",
        name: "report.md",
        kind: "file" as const,
        extension: "md",
        mtimeMs: Date.now() - 3_600_000
      },
      {
        path: "/Users/demo/Documents/launchers",
        name: "launchers",
        kind: "folder" as const,
        extension: null,
        mtimeMs: Date.now() - 7_200_000
      }
    ].filter((entry) => matchText(`${entry.name} ${entry.path}`, query));
  }

  return invokeCommand<FileRecord[]>("search_files", { query });
}

export async function liveSearchFiles(query: string): Promise<FileRecord[]> {
  if (!isTauriEnvironment()) {
    return [];
  }
  return invokeCommand<FileRecord[]>("live_search_files", { query });
}

export async function listClipboardItems(): Promise<ClipboardItem[]> {
  if (!isTauriEnvironment()) {
    return [...mockClipboardItems];
  }

  return invokeCommand<ClipboardItem[]>("list_clipboard_items");
}

export async function listSnippets(): Promise<SnippetRecord[]> {
  if (!isTauriEnvironment()) {
    return [...mockSnippets];
  }

  return invokeCommand<SnippetRecord[]>("list_snippets");
}

export async function saveSnippet(snippet: SnippetInput): Promise<SnippetRecord> {
  if (!isTauriEnvironment()) {
    const now = Date.now();
    const id = snippet.id?.trim() || makeId("snippet");
    const existing = mockSnippets.find((entry) => entry.id === id);
    const record: SnippetRecord = {
      id,
      name: snippet.name,
      trigger: snippet.trigger,
      content: snippet.content,
      enabled: snippet.enabled,
      scope: snippet.scope ?? null,
      appRestriction: snippet.appRestriction ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    mockSnippets = [record, ...mockSnippets.filter((entry) => entry.id !== id)];
    return record;
  }

  return invokeCommand<SnippetRecord>("save_snippet", { snippet });
}

export async function deleteSnippet(id: string): Promise<void> {
  if (!isTauriEnvironment()) {
    mockSnippets = mockSnippets.filter((entry) => entry.id !== id);
    return;
  }

  await invokeCommand("delete_snippet", { id });
}

export async function listWorkflows(): Promise<WorkflowRecord[]> {
  if (!isTauriEnvironment()) {
    return mockWorkflows.map((workflow) => cloneWorkflow(workflow));
  }

  return invokeCommand<WorkflowRecord[]>("list_workflows");
}

export async function saveWorkflow(workflow: WorkflowRecord): Promise<WorkflowRecord> {
  if (!isTauriEnvironment()) {
    const now = Date.now();
    const existing = mockWorkflows.find((entry) => entry.id === workflow.id);
    const saved: WorkflowRecord = {
      ...cloneWorkflow(workflow),
      createdAt: existing?.createdAt ?? workflow.createdAt ?? now,
      updatedAt: now
    };
    mockWorkflows = [
      saved,
      ...mockWorkflows.filter((entry) => entry.id !== saved.id)
    ].sort((left, right) => Number(right.builtIn) - Number(left.builtIn) || right.updatedAt - left.updatedAt);
    return cloneWorkflow(saved);
  }

  return invokeCommand<WorkflowRecord>("save_workflow", { workflow });
}

export async function deleteWorkflow(id: string): Promise<void> {
  if (!isTauriEnvironment()) {
    mockWorkflows = mockWorkflows.filter((entry) => entry.id !== id);
    return;
  }

  await invokeCommand("delete_workflow", { id });
}

export async function updateSettings(
  settings: LauncherSettings
): Promise<LauncherSettings> {
  if (!isTauriEnvironment()) {
    mockSettings = cloneSettings(settings);
    mockIndexStatus = {
      ...mockIndexStatus,
      indexedPaths: [...mockSettings.indexPaths],
      excludedPaths: [...mockSettings.indexExclusions],
      paused: mockSettings.indexingPaused,
      state: mockSettings.indexingPaused
        ? "paused"
        : mockIndexStatus.lastIndexedAt
          ? "stale"
          : "idle",
      message: mockSettings.indexingPaused
        ? "Mock indexing paused. Existing file results remain searchable."
        : "Mock index settings changed. Rebuild to apply directory and exclusion updates."
    };
    return cloneSettings(mockSettings);
  }

  return invokeCommand<LauncherSettings>("update_settings", { settings });
}

export async function recordSelection(
  itemId: string,
  itemType: ResultItem["type"],
  query: string
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  await invokeCommand("record_selection", { itemId, itemType, query });
}

export async function rebuildFileIndex(): Promise<FileIndexStatus> {
  if (!isTauriEnvironment()) {
    mockIndexStatus = {
      ...mockIndexStatus,
      state: mockSettings.indexingPaused ? "paused" : "ready",
      indexedCount: mockIndexStatus.indexedCount + 24,
      indexedPaths: [...mockSettings.indexPaths],
      excludedPaths: [...mockSettings.indexExclusions],
      lastIndexedAt: Date.now(),
      message: mockSettings.indexingPaused
        ? "Mock indexing is paused. Resume to rebuild."
        : "Mock file index rebuilt.",
      lastError: null,
      paused: mockSettings.indexingPaused
    };
    return mockIndexStatus;
  }

  return invokeCommand<FileIndexStatus>("rebuild_file_index");
}

export async function getFileIndexStatus(): Promise<FileIndexStatus> {
  if (!isTauriEnvironment()) {
    return { ...mockIndexStatus };
  }

  return invokeCommand<FileIndexStatus>("get_file_index_status");
}

export async function pluginExecShell(
  pluginId: string,
  command: string
): Promise<PluginShellResult> {
  if (!isTauriEnvironment()) {
    return {
      exitCode: 0,
      stdout: `Mock execution: ${command}`,
      stderr: ""
    };
  }

  return invokeCommand<PluginShellResult>("plugin_exec_shell", {
    pluginId,
    command
  });
}

export async function workflowExecShell(
  command: string
): Promise<PluginShellResult> {
  if (!isTauriEnvironment()) {
    return {
      exitCode: 0,
      stdout: `Mock workflow execution: ${command}`,
      stderr: ""
    };
  }

  return invokeCommand<PluginShellResult>("workflow_exec_shell", {
    command
  });
}

export async function workflowHttpRequest(
  request: WorkflowHttpRequest
): Promise<WorkflowHttpResponse> {
  if (!isTauriEnvironment()) {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? 5000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(request.url);
      for (const [key, value] of Object.entries(request.queryParams ?? {})) {
        url.searchParams.set(key, value);
      }
      const headers = new Headers(request.headers);
      if (request.jsonBody !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(url, {
        method: request.method,
        headers,
        body: request.jsonBody === undefined ? undefined : JSON.stringify(request.jsonBody),
        signal: controller.signal
      });
      const text = await response.text();
      const contentType = response.headers.get("content-type");
      let json: unknown = undefined;
      if (contentType?.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }

      return {
        url: response.url || url.toString(),
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        contentType,
        text,
        json
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return invokeCommand<WorkflowHttpResponse>("workflow_http_request", {
    request
  });
}

export async function pluginReadClipboardText(pluginId: string): Promise<string> {
  if (!isTauriEnvironment()) {
    return readClipboardText();
  }

  return invokeCommand<string>("plugin_read_clipboard_text", { pluginId });
}

export async function pluginWriteClipboardText(
  pluginId: string,
  text: string
): Promise<void> {
  if (!isTauriEnvironment()) {
    await writeClipboardText(text);
    insertMockClipboardText(text);
    return;
  }

  await invokeCommand("plugin_write_clipboard_text", { pluginId, text });
}

export async function performAction(
  action: ActionItem,
  result?: ResultItem
): Promise<ActionResponse> {
  if (!isTauriEnvironment()) {
    return handleBrowserAction(action, result);
  }

  return invokeCommand<ActionResponse>("perform_action", { action, result });
}

export async function hideWindow(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  await invokeCommand("hide_window");
}

export async function openDevtools(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  await invokeCommand("open_devtools");
}

const MOCK_MARKETPLACE_ENTRIES: MarketplaceEntry[] = [
  {
    id: "com.osb.base64",
    name: "Encode / Decode",
    description: "Base64, URL encoding, HTML entities and other common encodings.",
    version: "0.4.0",
    author: "OSB",
    stars: 0,
    tags: [],
    updatedAt: ""
  },
  {
    id: "com.osb.calculator",
    name: "Calculator",
    description: "Evaluate arithmetic expressions inline.",
    version: "0.1.0",
    author: "OSB",
    stars: 0,
    tags: [],
    updatedAt: ""
  },
  {
    id: "com.osb.color-picker",
    name: "Color Picker",
    description: "Pick colors from anywhere on screen, convert between HEX / RGB / HSL formats.",
    version: "1.0.0",
    author: "OSB",
    stars: 0,
    tags: [],
    updatedAt: ""
  },
  {
    id: "com.osb.github",
    name: "GitHub Search",
    description: "Open GitHub repository and code searches from the launcher.",
    version: "0.1.0",
    author: "OSB",
    stars: 0,
    tags: ["network"],
    updatedAt: ""
  },
  {
    id: "com.osb.hash",
    name: "Hash Generator",
    description: "Compute SHA-256 hashes for text.",
    version: "0.2.0",
    author: "OSB",
    stars: 0,
    tags: [],
    updatedAt: ""
  },
  {
    id: "com.osb.ip-lookup",
    name: "IP Lookup",
    description: "Show your public IP, geolocation, and ISP info. Also look up any IP or domain.",
    version: "0.3.1",
    author: "OSB",
    stars: 0,
    tags: ["network"],
    updatedAt: ""
  },
  {
    id: "com.osb.shell",
    name: "Shell Command",
    description: "Run an ad-hoc shell command from the launcher (prefers iTerm2).",
    version: "0.1.0",
    author: "OSB",
    stars: 0,
    tags: ["shell.exec"],
    updatedAt: ""
  },
  {
    id: "com.osb.timestamp",
    name: "Timestamp Converter",
    description: "Convert between Unix timestamps, ISO 8601, and human-readable date formats.",
    version: "0.2.0",
    author: "OSB",
    stars: 0,
    tags: [],
    updatedAt: ""
  }
];

export async function fetchPluginRegistry(): Promise<MarketplaceEntry[]> {
  if (!isTauriEnvironment()) {
    return [...MOCK_MARKETPLACE_ENTRIES];
  }

  return invokeCommand<MarketplaceEntry[]>("fetch_plugin_registry");
}

export async function installMarketplacePlugin(
  pluginId: string
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  await invokeCommand("install_marketplace_plugin", { pluginId });
}

export async function uninstallMarketplacePlugin(pluginId: string): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  await invokeCommand("uninstall_marketplace_plugin", { pluginId });
}

export async function resizeWindow(width: number, height: number): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  await invokeCommand("resize_window", { width, height });
}

async function handleBrowserAction(
  action: ActionItem,
  result?: ResultItem
): Promise<ActionResponse> {
  switch (action.kind) {
    case "search-web":
    case "open-url": {
      const url = resolveActionValue(action, result, "url");
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return { ok: true };
    }
    case "copy-path":
    case "copy-text": {
      const text = resolveActionValue(
        action,
        result,
        action.kind === "copy-path" ? "path" : "text"
      );
      if (text) {
        await writeClipboardText(text);
        insertMockClipboardText(text);
      }
      return { ok: true, message: "Copied to clipboard." };
    }
    case "paste-text": {
      const text = resolveActionValue(action, result, "text");
      if (text) {
        await writeClipboardText(text);
        insertMockClipboardText(text);
      }
      return {
        ok: true,
        message: "Copied to clipboard."
      };
    }
    case "pin-clipboard-item":
    case "unpin-clipboard-item": {
      const itemId = resolveActionValue(action, result, "itemId");
      if (itemId) {
        const pinned = action.kind === "pin-clipboard-item";
        mockClipboardItems = mockClipboardItems.map((entry) =>
          entry.id === itemId ? { ...entry, pinned } : entry
        );
      }
      return { ok: true };
    }
    case "delete-clipboard-item": {
      const itemId = resolveActionValue(action, result, "itemId");
      if (itemId) {
        mockClipboardItems = mockClipboardItems.filter((entry) => entry.id !== itemId);
      }
      return { ok: true };
    }
    case "clear-clipboard-history": {
      mockClipboardItems = [];
      return { ok: true, message: "Clipboard history cleared." };
    }
    case "expand-snippet": {
      const snippetId = resolveActionValue(action, result, "snippetId");
      const snippet = mockSnippets.find((entry) => entry.id === snippetId);
      if (!snippet) {
        return { ok: false, message: "Snippet not found." };
      }

      const expanded = await expandSnippetContent(snippet.content);
      await writeClipboardText(expanded);
      insertMockClipboardText(expanded);
      return {
        ok: true,
        message: `Expanded snippet ${snippet.trigger}. Copied to clipboard.`
      };
    }
    case "launch-app":
    case "open-path":
    case "reveal-in-folder":
    case "open-in-terminal":
    case "run-plugin-action":
      return {
        ok: false,
        message: "This action requires the Tauri desktop runtime."
      };
    default:
      return { ok: true };
  }
}

function matchText(haystack: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return haystack.toLowerCase().includes(normalizedQuery);
}

export function resolveActionValue(
  action: ActionItem,
  result: ResultItem | undefined,
  key: string
): string | undefined {
  const fromAction = action.payload?.[key];
  if (typeof fromAction === "string") {
    return fromAction;
  }

  const fromResult = result?.payload[key];
  return typeof fromResult === "string" ? fromResult : undefined;
}

async function writeClipboardText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

async function readClipboardText(): Promise<string> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return mockClipboardItems[0]?.text ?? "";
    }
  }

  return mockClipboardItems[0]?.text ?? "";
}

async function expandSnippetContent(content: string): Promise<string> {
  const now = new Date();
  const clipboardText = await readClipboardText();

  return content
    .replaceAll("{{date}}", now.toISOString().slice(0, 10))
    .replaceAll("${date}", now.toISOString().slice(0, 10))
    .replaceAll("{{time}}", now.toTimeString().slice(0, 8))
    .replaceAll("${time}", now.toTimeString().slice(0, 8))
    .replaceAll("{{clipboard}}", clipboardText)
    .replaceAll("${clipboard}", clipboardText)
    .replaceAll("{{uuid}}", makeId("uuid"))
    .replaceAll("${uuid}", makeId("uuid"));
}

function insertMockClipboardText(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }

  const existing = mockClipboardItems.find((entry) => entry.text === normalized);
  const nextItem: ClipboardItem = {
    id: existing?.id ?? makeId("clip"),
    contentType: "text",
    text: normalized,
    preview: normalized.slice(0, 120),
    pinned: existing?.pinned ?? false,
    createdAt: Date.now(),
    sourceApp: "Browser preview",
    metadata: null
  };

  mockClipboardItems = [
    nextItem,
    ...mockClipboardItems.filter((entry) => entry.id !== nextItem.id)
  ]
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt
    )
    .slice(0, mockSettings.clipboard.maxItems);
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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

function cloneWorkflow(workflow: WorkflowRecord): WorkflowRecord {
  return JSON.parse(JSON.stringify(workflow)) as WorkflowRecord;
}
