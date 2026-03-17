import type { ActionResponse, PluginPermission } from "@pulse/shared-types";
import type {
  LauncherPluginModule,
  PluginActionContext,
  PluginApi,
  PluginSearchContext,
  PluginSearchResult
} from "@pulse/plugin-sdk";

type HostToWorkerMessage =
  | {
      type: "load";
      manifestId: string;
      entrySource: string;
    }
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
    }
  | {
      type: "api-response";
      apiRequestId: string;
      ok: boolean;
      data?: unknown;
      error?: string;
      errorType?: "permission";
      permission?: PluginPermission;
      reason?: string;
    }
  | {
      type: "dispose";
    };

type WorkerToHostMessage =
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

const apiRequests = new Map<
  string,
  {
    resolve(value: unknown): void;
    reject(error: Error): void;
  }
>();

let plugin: LauncherPluginModule | null = null;

self.onmessage = async (event: MessageEvent<HostToWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "load": {
      try {
        disableAmbientCapabilities();
        plugin = await loadPlugin(message.entrySource, message.manifestId);
        postMessage({ type: "loaded" } satisfies WorkerToHostMessage);
      } catch (error) {
        postMessage({
          type: "response",
          requestId: "load",
          ok: false,
          error: serializeError(error)
        } satisfies WorkerToHostMessage);
      }
      break;
    }
    case "search": {
      try {
        const loadedPlugin = getLoadedPlugin();
        const results = (await loadedPlugin.search?.(message.context, createApi())) ?? [];
        postMessage({
          type: "response",
          requestId: message.requestId,
          ok: true,
          data: results
        } satisfies WorkerToHostMessage);
      } catch (error) {
        postMessage({
          type: "response",
          requestId: message.requestId,
          ok: false,
          error: serializeError(error),
          ...(serializePermissionError(error) ?? {})
        } satisfies WorkerToHostMessage);
      }
      break;
    }
    case "action": {
      try {
        const loadedPlugin = getLoadedPlugin();
        const response = await loadedPlugin.runAction?.(
          message.actionId,
          message.payload,
          message.context,
          createApi()
        );
        postMessage({
          type: "response",
          requestId: message.requestId,
          ok: true,
          data: response
        } satisfies WorkerToHostMessage);
      } catch (error) {
        postMessage({
          type: "response",
          requestId: message.requestId,
          ok: false,
          error: serializeError(error),
          ...(serializePermissionError(error) ?? {})
        } satisfies WorkerToHostMessage);
      }
      break;
    }
    case "api-response": {
      const pending = apiRequests.get(message.apiRequestId);
      if (!pending) {
        return;
      }

      apiRequests.delete(message.apiRequestId);
      if (message.ok) {
        pending.resolve(message.data);
      } else {
        if (message.errorType === "permission" && message.permission) {
          pending.reject(
            new WorkerPermissionError(
              message.permission,
              message.reason ?? message.error ?? "Permission denied."
            )
          );
        } else {
          pending.reject(new Error(message.error ?? "Plugin API request failed."));
        }
      }
      break;
    }
    case "dispose": {
      if (plugin?.dispose) {
        await plugin.dispose();
      }
      plugin = null;
      self.close();
      break;
    }
  }
};

function createApi(): PluginApi {
  return {
    fetchJson<T = unknown>(
      url: string,
      init?: {
        method?: "GET" | "POST";
        headers?: Record<string, string>;
        body?: string;
      }
    ) {
      return requestHost("fetch-json", {
        url,
        init: init ?? {}
      }) as Promise<T>;
    },
    execShell(command) {
      return requestHost("exec-shell", { command }) as Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>;
    },
    readClipboardText() {
      return requestHost("read-clipboard-text", {}) as Promise<string>;
    },
    writeClipboardText(text) {
      return requestHost("write-clipboard-text", { text }).then(() => undefined);
    },
    openUrl(url) {
      return requestHost("open-url", { url }).then(() => undefined);
    },
    showNotification(title, body) {
      return requestHost("notify", { title, body }).then(() => undefined);
    }
  };
}

function requestHost(
  method: PluginApiMethod,
  payload: Record<string, unknown>
): Promise<unknown> {
  const apiRequestId = makeId("api");

  return new Promise((resolve, reject) => {
    apiRequests.set(apiRequestId, { resolve, reject });
    postMessage({
      type: "api-request",
      apiRequestId,
      method,
      payload
    } satisfies WorkerToHostMessage);
  });
}

async function loadPlugin(
  entrySource: string,
  manifestId: string
): Promise<LauncherPluginModule> {
  const source = `${entrySource}\n//# sourceURL=pulse-plugin://${manifestId}`;
  const blobUrl = URL.createObjectURL(
    new Blob([source], {
      type: "text/javascript"
    })
  );

  try {
    const imported = (await import(/* @vite-ignore */ blobUrl)) as {
      default?: unknown;
    };
    const loaded = imported.default;
    if (!isPluginModule(loaded)) {
      throw new Error("Plugin must export an object with search() or runAction().");
    }
    return loaded;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function getLoadedPlugin(): LauncherPluginModule {
  if (!plugin) {
    throw new Error("Plugin was not loaded.");
  }
  return plugin;
}

function disableAmbientCapabilities() {
  // TODO: Move plugin execution into a stricter sandbox. Worker isolation is the Phase 3 baseline.
  try {
    Object.defineProperty(globalThis, "fetch", {
      value: undefined,
      configurable: true
    });
  } catch {
    // Ignore non-configurable environments.
  }

  try {
    Object.defineProperty(globalThis, "WebSocket", {
      value: undefined,
      configurable: true
    });
  } catch {
    // Ignore non-configurable environments.
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPluginModule(value: unknown): value is LauncherPluginModule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as LauncherPluginModule;
  return (
    typeof candidate.search === "function" || typeof candidate.runAction === "function"
  );
}

function serializePermissionError(error: unknown):
  | {
      errorType: "permission";
      permission: PluginPermission;
      reason: string;
    }
  | undefined {
  if (error instanceof WorkerPermissionError) {
    return {
      errorType: "permission",
      permission: error.permission,
      reason: error.reason
    };
  }

  return undefined;
}

class WorkerPermissionError extends Error {
  permission: PluginPermission;
  reason: string;

  constructor(permission: PluginPermission, reason: string) {
    super(reason);
    this.permission = permission;
    this.reason = reason;
  }
}
