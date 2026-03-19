import type {
  ActionItem,
  ActionResponse,
  DiscoveredPlugin,
  LauncherSettings,
  PluginPermission,
  PluginPermissionRequest,
  PluginRuntimeSnapshot,
  ResultItem,
  SearchContext
} from "@osb/shared-types";
import type {
  PluginActionContext,
  PluginSearchContext,
  PluginSearchResult
} from "@osb/plugin-sdk";

import {
  pluginExecShell,
  pluginReadClipboardText,
  pluginWriteClipboardText
} from "../../lib/backend";
import type { Logger } from "../../lib/logger";

type PluginWorkerMessage =
  | {
      type: "loaded";
    }
  | {
      type: "response";
      requestId: string;
      ok: boolean;
      data?: PluginSearchResult[] | ActionResponse | void;
      error?: string;
      errorType?: "permission";
      permission?: PluginPermission;
      reason?: string;
    }
  | {
      type: "api-request";
      apiRequestId: string;
      method: PluginApiMethod;
      payload: Record<string, unknown>;
    };

type PluginApiMethod =
  | "fetch-json"
  | "exec-shell"
  | "read-clipboard-text"
  | "write-clipboard-text"
  | "open-url"
  | "notify";

interface RuntimeStatus {
  state: PluginRuntimeSnapshot["status"];
  lastError?: string;
  lastLoadedAt?: number;
  missingPermissions: Set<PluginPermission>;
}

interface PluginRuntimeState {
  worker?: Worker;
  loadPromise?: Promise<void>;
  pendingRequests: Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
    }
  >;
  status: RuntimeStatus;
}

interface PluginHostState {
  snapshots: PluginRuntimeSnapshot[];
  permissionRequests: PluginPermissionRequest[];
}

export class PluginHost {
  #definitions = new Map<string, DiscoveredPlugin>();
  #runtimes = new Map<string, PluginRuntimeState>();
  #settings: LauncherSettings;
  #permissionRequests = new Map<string, PluginPermissionRequest>();
  #listeners = new Set<(state: PluginHostState) => void>();
  #logger?: Logger;

  constructor(settings: LauncherSettings, logger?: Logger) {
    this.#settings = settings;
    this.#logger = logger;
  }

  initialize(definitions: DiscoveredPlugin[], settings: LauncherSettings) {
    this.#settings = settings;

    const nextDefinitions = new Map(
      definitions.map((plugin) => [plugin.manifest.id, plugin])
    );
    for (const pluginId of this.#definitions.keys()) {
      if (!nextDefinitions.has(pluginId)) {
        this.#disposeRuntime(pluginId);
      }
    }

    this.#definitions = nextDefinitions;
    this.#syncRuntimes();
    this.#emit();
  }

  updateSettings(settings: LauncherSettings) {
    this.#settings = settings;
    this.#syncRuntimes();
    this.#emit();
  }

  dismissPermissionRequest(pluginId: string, permission: PluginPermission) {
    this.#permissionRequests.delete(this.#requestKey(pluginId, permission));
    const runtime = this.#runtimes.get(pluginId);
    runtime?.status.missingPermissions.delete(permission);
    if (runtime && runtime.status.state === "permission-required") {
      runtime.status.state = "ready";
    }
    this.#emit();
  }

  subscribe(listener: (state: PluginHostState) => void): () => void {
    this.#listeners.add(listener);
    listener({
      snapshots: this.getSnapshots(),
      permissionRequests: this.getPermissionRequests()
    });
    return () => {
      this.#listeners.delete(listener);
    };
  }

  getSnapshots(): PluginRuntimeSnapshot[] {
    return [...this.#definitions.values()].map((definition) => {
      const runtime = this.#ensureRuntimeState(definition.manifest.id);
      const grantedPermissions =
        this.#settings.plugins.grantedPermissions[definition.manifest.id] ?? [];
      const disabled =
        !this.#settings.plugins.enableHost ||
        this.#settings.plugins.disabledPluginIds.includes(definition.manifest.id);

      let status = runtime.status.state;
      if (definition.validationErrors.length > 0) {
        status = "error";
      } else if (disabled) {
        status = "disabled";
      }

      return {
        pluginId: definition.manifest.id,
        manifest: definition.manifest,
        status,
        grantedPermissions,
        missingPermissions: [...runtime.status.missingPermissions],
        validationErrors: definition.validationErrors,
        lastError: runtime.status.lastError,
        lastLoadedAt: runtime.status.lastLoadedAt
      };
    });
  }

  getPermissionRequests(): PluginPermissionRequest[] {
    return [...this.#permissionRequests.values()].sort(
      (left, right) => right.createdAt - left.createdAt
    );
  }

  async search(query: string, context: SearchContext): Promise<ResultItem[]> {
    if (!this.#settings.plugins.enableHost) {
      return [];
    }

    const tasks = [...this.#definitions.values()].map(async (definition) => {
      if (definition.validationErrors.length > 0) {
        return [];
      }
      if (this.#settings.plugins.disabledPluginIds.includes(definition.manifest.id)) {
        return [];
      }

      try {
        const results = await this.#searchPlugin(definition, query, context);
        return results;
      } catch (error) {
        this.#logger?.warn("Plugin search failed.", {
          pluginId: definition.manifest.id,
          error: error instanceof Error ? error.message : String(error)
        });
        this.#markPluginError(definition.manifest.id, "error", error);
        return [];
      }
    });

    const settled = await Promise.allSettled(tasks);
    return settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
  }

  async runAction(
    action: ActionItem,
    result: ResultItem,
    settings: LauncherSettings
  ): Promise<ActionResponse> {
    const pluginId =
      result.pluginId ??
      this.#readStringPayload(
        (action.payload as Record<string, unknown>) ?? {},
        "pluginId"
      );
    if (!pluginId) {
      return { ok: false, message: "Plugin action is missing a plugin id." };
    }

    const definition = this.#definitions.get(pluginId);
    if (!definition) {
      return { ok: false, message: `Plugin ${pluginId} was not found.` };
    }

    this.#settings = settings;
    if (
      !settings.plugins.enableHost ||
      settings.plugins.disabledPluginIds.includes(pluginId)
    ) {
      return { ok: false, message: `Plugin ${definition.manifest.name} is disabled.` };
    }

    const missing = (action.requires ?? []).filter(
      (permission): permission is PluginPermission =>
        !this.#hasPermission(pluginId, permission as PluginPermission)
    );
    if (missing.length > 0) {
      for (const permission of missing) {
        this.#requestPermission(definition, permission, "Required by plugin action.");
      }
      this.#emit();
      return {
        ok: false,
        message: `Grant ${missing.join(", ")} to ${definition.manifest.name} in Settings > Plugins.`
      };
    }

    try {
      const runtime = await this.#ensureLoaded(definition);
      const response = (await this.#invokeWorker<ActionResponse | void>(
        runtime,
        {
          type: "action",
          requestId: this.#makeId("action"),
          actionId: action.id,
          payload: {
            ...(action.payload ?? {}),
            ...(result.payload ?? {})
          },
          context: this.#createPluginActionContext(definition)
        },
        pluginId
      )) ?? { ok: true };

      return {
        ok: response.ok ?? true,
        message: response.message
      };
    } catch (error) {
      if (error instanceof PluginPermissionError) {
        this.#requestPermission(definition, error.permission, error.reason);
        this.#emit();
        return {
          ok: false,
          message: `Grant ${error.permission} to ${definition.manifest.name} in Settings > Plugins.`
        };
      }

      if (error instanceof PluginTimeoutError) {
        this.#logger?.warn("Plugin action timed out.", {
          pluginId,
          error: error.message
        });
        this.#markPluginError(pluginId, "timed-out", error);
      } else {
        this.#logger?.warn("Plugin action failed.", {
          pluginId,
          error: error instanceof Error ? error.message : String(error)
        });
        this.#markPluginError(pluginId, "error", error);
      }
      this.#emit();
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Plugin action failed."
      };
    }
  }

  #syncRuntimes() {
    for (const definition of this.#definitions.values()) {
      const runtime = this.#ensureRuntimeState(definition.manifest.id);
      runtime.status.missingPermissions = new Set(
        [...runtime.status.missingPermissions].filter((permission) =>
          definition.manifest.permissions.includes(permission)
        )
      );

      if (
        !this.#settings.plugins.enableHost ||
        this.#settings.plugins.disabledPluginIds.includes(definition.manifest.id)
      ) {
        this.#disposeRuntime(definition.manifest.id);
        runtime.status.state = "disabled";
        runtime.status.lastError = undefined;
      } else if (definition.validationErrors.length > 0) {
        runtime.status.state = "error";
        runtime.status.lastError = definition.validationErrors.join(" ");
      } else if (runtime.status.state === "disabled") {
        runtime.status.state = "ready";
      }

      runtime.status.missingPermissions = new Set(
        [...runtime.status.missingPermissions].filter(
          (permission) => !this.#hasPermission(definition.manifest.id, permission)
        )
      );
    }
  }

  async #searchPlugin(
    definition: DiscoveredPlugin,
    query: string,
    context: SearchContext
  ): Promise<ResultItem[]> {
    const runtime = await this.#ensureLoaded(definition);

    try {
      const results =
        (await this.#invokeWorker<PluginSearchResult[]>(
          runtime,
          {
            type: "search",
            requestId: this.#makeId("search"),
            context: this.#createPluginSearchContext(definition, query, context)
          },
          definition.manifest.id
        )) ?? [];

      runtime.status.state = "ready";
      runtime.status.lastError = undefined;
      this.#emit();
      return results.map((result) => this.#normalizePluginResult(definition, result));
    } catch (error) {
      if (error instanceof PluginPermissionError) {
        this.#requestPermission(definition, error.permission, error.reason);
        this.#emit();
        if (this.#isQueryLikelyForPlugin(definition, query)) {
          return [this.#permissionResult(definition, error.permission)];
        }
        return [];
      }

      if (error instanceof PluginTimeoutError) {
        this.#logger?.warn("Plugin search timed out.", {
          pluginId: definition.manifest.id,
          error: error.message
        });
        this.#markPluginError(definition.manifest.id, "timed-out", error);
      } else {
        this.#markPluginError(definition.manifest.id, "error", error);
      }
      this.#emit();
      return [];
    }
  }

  #createPluginSearchContext(
    definition: DiscoveredPlugin,
    query: string,
    context: SearchContext
  ): PluginSearchContext {
    return {
      query,
      normalizedQuery: query.trim().toLowerCase(),
      now: context.now,
      commands: definition.manifest.commands,
      permissions: definition.manifest.permissions,
      settings: context.settings
    };
  }

  #createPluginActionContext(definition: DiscoveredPlugin): PluginActionContext {
    return {
      now: Date.now(),
      settings: this.#settings,
      permissions: definition.manifest.permissions
    };
  }

  #normalizePluginResult(
    definition: DiscoveredPlugin,
    result: PluginSearchResult
  ): ResultItem {
    return {
      id: `plugin:${definition.manifest.id}:${result.id}`,
      title: result.title,
      subtitle: result.subtitle,
      type: result.type ?? "plugin",
      source: "plugins",
      score: result.score ?? 0.74,
      pluginId: definition.manifest.id,
      tags: result.tags,
      actions: (result.actions ?? []).map((action) => ({
        ...action,
        payload: {
          pluginId: definition.manifest.id,
          ...(action.payload ?? {})
        }
      })),
      payload: {
        pluginId: definition.manifest.id,
        ...(result.payload ?? {})
      }
    };
  }

  #permissionResult(
    definition: DiscoveredPlugin,
    permission: PluginPermission
  ): ResultItem {
    return {
      id: `plugin-permission:${definition.manifest.id}:${permission}`,
      title: `${definition.manifest.name} requires ${permission}`,
      subtitle: "Open Settings > Plugins to grant this permission.",
      type: "plugin",
      source: "plugins",
      score: 0.45,
      pluginId: definition.manifest.id,
      actions: [
        {
          id: "show-settings",
          title: "Open settings",
          kind: "show-settings",
          shortcut: "Enter"
        }
      ],
      payload: {
        pluginId: definition.manifest.id
      }
    };
  }

  async #ensureLoaded(definition: DiscoveredPlugin): Promise<PluginRuntimeState> {
    const runtime = this.#ensureRuntimeState(definition.manifest.id);

    if (runtime.worker && !runtime.loadPromise) {
      return runtime;
    }

    if (runtime.loadPromise) {
      await runtime.loadPromise;
      return runtime;
    }

    runtime.status.state = "loading";
    const worker = new Worker(new URL("./plugin-runner.worker.ts", import.meta.url), {
      type: "module"
    });
    runtime.worker = worker;
    worker.onmessage = (event: MessageEvent<PluginWorkerMessage>) => {
      void this.#handleWorkerMessage(definition, runtime, event.data);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Plugin worker crashed.");
      this.#logger?.error("Plugin worker crashed.", {
        pluginId: definition.manifest.id,
        error: error.message
      });
      this.#markPluginError(definition.manifest.id, "error", error);
      this.#disposeRuntime(definition.manifest.id);
      this.#emit();
    };

    runtime.loadPromise = this.#withTimeout(
      new Promise<void>((resolve, reject) => {
        const requestId = "load";
        runtime.pendingRequests.set(requestId, {
          resolve() {
            resolve();
          },
          reject
        });
        worker.postMessage({
          type: "load",
          manifestId: definition.manifest.id,
          entrySource: definition.entrySource
        });
      }),
      definition.manifest.id
    )
      .then(() => {
        runtime.status.state = "ready";
        runtime.status.lastLoadedAt = Date.now();
        runtime.status.lastError = undefined;
        this.#logger?.info("Plugin worker loaded.", {
          pluginId: definition.manifest.id
        });
      })
      .catch((error) => {
        if (error instanceof PluginTimeoutError) {
          this.#markPluginError(definition.manifest.id, "timed-out", error);
        } else {
          this.#markPluginError(definition.manifest.id, "error", error);
        }
        this.#disposeRuntime(definition.manifest.id);
        throw error;
      })
      .finally(() => {
        runtime.loadPromise = undefined;
        this.#emit();
      });

    await runtime.loadPromise;
    return runtime;
  }

  async #handleWorkerMessage(
    definition: DiscoveredPlugin,
    runtime: PluginRuntimeState,
    message: PluginWorkerMessage
  ) {
    switch (message.type) {
      case "loaded": {
        const pending = runtime.pendingRequests.get("load");
        runtime.pendingRequests.delete("load");
        pending?.resolve(undefined);
        break;
      }
      case "response": {
        const pending = runtime.pendingRequests.get(message.requestId);
        if (!pending) {
          return;
        }

        runtime.pendingRequests.delete(message.requestId);
        if (message.ok) {
          pending.resolve(message.data);
        } else {
          if (message.errorType === "permission" && message.permission) {
            pending.reject(
              new PluginPermissionError(
                message.permission,
                message.reason ?? message.error ?? "Permission denied."
              )
            );
          } else {
            pending.reject(new Error(message.error ?? "Plugin request failed."));
          }
        }
        break;
      }
      case "api-request": {
        try {
          const data = await this.#handleApiRequest(
            definition,
            message.method,
            message.payload
          );
          runtime.worker?.postMessage({
            type: "api-response",
            apiRequestId: message.apiRequestId,
            ok: true,
            data
          });
        } catch (error) {
          runtime.worker?.postMessage({
            type: "api-response",
            apiRequestId: message.apiRequestId,
            ok: false,
            error: error instanceof Error ? error.message : "Plugin API request failed.",
            ...(error instanceof PluginPermissionError
              ? {
                  errorType: "permission" as const,
                  permission: error.permission,
                  reason: error.reason
                }
              : {})
          });
        }
        break;
      }
    }
  }

  async #handleApiRequest(
    definition: DiscoveredPlugin,
    method: PluginApiMethod,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    switch (method) {
      case "fetch-json": {
        this.#requirePermission(
          definition,
          "network",
          "Network access requested by plugin."
        );
        const url = this.#readStringPayload(payload, "url");
        if (!url) {
          throw new Error("Plugin fetch is missing a URL.");
        }

        const init =
          (payload.init as {
            method?: string;
            headers?: Record<string, string>;
            body?: string;
          }) ?? {};

        const controller = new AbortController();
        const timer = window.setTimeout(
          () => controller.abort(),
          Math.max(this.#settings.plugins.timeoutMs, 500)
        );

        try {
          const response = await fetch(url, {
            method: init.method ?? "GET",
            headers: init.headers,
            body: init.body,
            signal: controller.signal
          });
          if (!response.ok) {
            throw new Error(
              `Request failed with ${response.status} ${response.statusText}.`
            );
          }
          return response.json();
        } finally {
          window.clearTimeout(timer);
        }
      }
      case "exec-shell": {
        this.#requirePermission(
          definition,
          "shell.exec",
          "Shell execution requested by plugin."
        );
        const command = this.#readStringPayload(payload, "command");
        if (!command) {
          throw new Error("Shell command is missing.");
        }
        return pluginExecShell(definition.manifest.id, command);
      }
      case "read-clipboard-text": {
        this.#requirePermission(
          definition,
          "clipboard.read",
          "Clipboard read requested by plugin."
        );
        return pluginReadClipboardText(definition.manifest.id);
      }
      case "write-clipboard-text": {
        this.#requirePermission(
          definition,
          "clipboard.write",
          "Clipboard write requested by plugin."
        );
        const text = this.#readStringPayload(payload, "text");
        if (!text) {
          throw new Error("Clipboard text is missing.");
        }
        await pluginWriteClipboardText(definition.manifest.id, text);
        return null;
      }
      case "open-url": {
        const url = this.#readStringPayload(payload, "url");
        if (!url) {
          throw new Error("Plugin openUrl() is missing a URL.");
        }
        window.open(url, "_blank", "noopener,noreferrer");
        return null;
      }
      case "notify": {
        this.#requirePermission(
          definition,
          "notifications",
          "Notification access requested by plugin."
        );
        // Notification permission granted but native channel not yet wired.
        return null;
      }
    }
  }

  async #invokeWorker<T>(
    runtime: PluginRuntimeState,
    message:
      | {
          type: "search";
          requestId: string;
          context: PluginSearchContext;
        }
      | {
          type: "action";
          requestId: string;
          actionId: string;
          payload: Record<string, unknown>;
          context: PluginActionContext;
        },
    pluginId: string
  ): Promise<T> {
    const worker = runtime.worker;
    if (!worker) {
      throw new Error(`Plugin worker for ${pluginId} is not available.`);
    }

    const promise = new Promise<T>((resolve, reject) => {
      runtime.pendingRequests.set(message.requestId, { resolve, reject });
      worker.postMessage(message);
    });

    return this.#withTimeout(promise, pluginId);
  }

  #withTimeout<T>(promise: Promise<T>, pluginId: string): Promise<T> {
    let handle: number | undefined;

    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        handle = window.setTimeout(
          () => {
            reject(new PluginTimeoutError(pluginId, this.#settings.plugins.timeoutMs));
          },
          Math.max(this.#settings.plugins.timeoutMs, 500)
        );
      })
    ]).finally(() => {
      if (handle) {
        window.clearTimeout(handle);
      }
    });
  }

  #disposeRuntime(pluginId: string) {
    const runtime = this.#runtimes.get(pluginId);
    if (!runtime?.worker) {
      return;
    }

    for (const pending of runtime.pendingRequests.values()) {
      pending.reject(new Error(`Plugin ${pluginId} runtime was disposed.`));
    }
    runtime.pendingRequests.clear();
    runtime.worker.terminate();
    runtime.worker = undefined;
    runtime.loadPromise = undefined;
  }

  #ensureRuntimeState(pluginId: string): PluginRuntimeState {
    const existing = this.#runtimes.get(pluginId);
    if (existing) {
      return existing;
    }

    const runtime: PluginRuntimeState = {
      pendingRequests: new Map(),
      status: {
        state: "ready",
        missingPermissions: new Set()
      }
    };
    this.#runtimes.set(pluginId, runtime);
    return runtime;
  }

  #requirePermission(
    definition: DiscoveredPlugin,
    permission: PluginPermission,
    reason: string
  ) {
    if (this.#hasPermission(definition.manifest.id, permission)) {
      return;
    }

    this.#requestPermission(definition, permission, reason);
    throw new PluginPermissionError(permission, reason);
  }

  #requestPermission(
    definition: DiscoveredPlugin,
    permission: PluginPermission,
    reason: string
  ) {
    const runtime = this.#ensureRuntimeState(definition.manifest.id);
    runtime.status.state = "permission-required";
    runtime.status.missingPermissions.add(permission);

    if (!this.#settings.plugins.promptOnFirstPermission) {
      return;
    }

    const key = this.#requestKey(definition.manifest.id, permission);
    if (this.#permissionRequests.has(key)) {
      return;
    }

    this.#permissionRequests.set(key, {
      pluginId: definition.manifest.id,
      pluginName: definition.manifest.name,
      permission,
      reason,
      createdAt: Date.now()
    });
  }

  #markPluginError(
    pluginId: string,
    state: PluginRuntimeSnapshot["status"],
    error: unknown
  ) {
    const runtime = this.#ensureRuntimeState(pluginId);
    runtime.status.state = state;
    runtime.status.lastError =
      error instanceof Error ? error.message : "Plugin execution failed.";
    if (state === "timed-out") {
      this.#logger?.warn("Plugin runtime timed out.", {
        pluginId,
        error: runtime.status.lastError
      });
      this.#disposeRuntime(pluginId);
    }
  }

  #hasPermission(pluginId: string, permission: PluginPermission): boolean {
    return (
      this.#settings.plugins.grantedPermissions[pluginId]?.includes(permission) ?? false
    );
  }

  #requestKey(pluginId: string, permission: PluginPermission): string {
    return `${pluginId}:${permission}`;
  }

  #isQueryLikelyForPlugin(definition: DiscoveredPlugin, query: string): boolean {
    const trimmed = query.trim().toLowerCase();
    return definition.manifest.commands.some((command) => {
      const normalized = command.name.trim().toLowerCase();
      return (
        trimmed.startsWith(`${normalized} `) ||
        trimmed === normalized ||
        (normalized === ">" && trimmed.startsWith(">"))
      );
    });
  }

  #readStringPayload(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === "string" ? value : undefined;
  }

  #makeId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  #emit() {
    const state = {
      snapshots: this.getSnapshots(),
      permissionRequests: this.getPermissionRequests()
    };
    for (const listener of this.#listeners) {
      listener(state);
    }
  }
}

class PluginTimeoutError extends Error {
  constructor(pluginId: string, timeoutMs: number) {
    super(`Plugin ${pluginId} timed out after ${timeoutMs}ms.`);
  }
}

class PluginPermissionError extends Error {
  permission: PluginPermission;
  reason: string;

  constructor(permission: PluginPermission, reason: string) {
    super(reason);
    this.permission = permission;
    this.reason = reason;
  }
}
