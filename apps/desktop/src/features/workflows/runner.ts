import {
  buildWorkflowRunContext,
  parseQuery,
  runWorkflow,
  type WorkflowRuntimeServices
} from "@osb/core";
import type {
  ActionResponse,
  ClipboardItem,
  FileIndexStatus,
  LauncherSettings,
  ResultItem,
  SearchContext,
  SnippetRecord,
  UsageStat,
  WorkflowHttpRequest,
  WorkflowRecord,
  WorkflowRunResult
} from "@osb/shared-types";

import type { PluginHost } from "../plugins/plugin-host";
import { getDefaultAction } from "../search/providers";

import {
  performAction,
  rebuildFileIndex,
  workflowHttpRequest,
  workflowExecShell
} from "../../lib/backend";

interface WorkflowLauncherRunnerOptions {
  workflow: WorkflowRecord;
  rawQuery: string;
  settings: LauncherSettings;
  usageByItemId: Record<string, UsageStat>;
  clipboardItems: ClipboardItem[];
  snippets: SnippetRecord[];
  workflows: WorkflowRecord[];
  pluginHost: PluginHost;
  onFileIndexStatusChange?(status: FileIndexStatus): void;
  searchLauncher?(query: string): Promise<ResultItem[]>;
  emitToast?(message: string): Promise<void> | void;
}

export async function runWorkflowInLauncher(
  options: WorkflowLauncherRunnerOptions
): Promise<WorkflowRunResult> {
  const {
    workflow,
    rawQuery,
    settings,
    usageByItemId,
    clipboardItems,
    snippets,
    workflows
  } = options;

  const context = buildWorkflowRunContext(workflow, rawQuery, {
    clipboardText: clipboardItems[0]?.text ?? clipboardItems[0]?.preview ?? "",
    launcherQuery: rawQuery
  });

  const services: WorkflowRuntimeServices = {
    async getClipboardText() {
      const local = clipboardItems[0]?.text ?? clipboardItems[0]?.preview;
      if (local) {
        return local;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return "";
        }
      }

      return "";
    },
    async performSharedAction(action, result) {
      if (action.kind === "rebuild-file-index") {
        const status = await rebuildFileIndex();
        options.onFileIndexStatusChange?.(status);
        return {
          ok: status.state !== "error",
          message: status.message ?? "File index rebuilt."
        };
      }

      return performAction(action, result);
    },
    async runShellCommand(command) {
      const result = await workflowExecShell(command);
      return {
        ok: result.exitCode === 0,
        message: (result.stdout || result.stderr || `Exit code ${result.exitCode}`).slice(
          0,
          400
        )
      } satisfies ActionResponse;
    },
    async invokePluginCommand(command, input) {
      const pluginQuery = [command, input].filter(Boolean).join(" ").trim();
      const searchContext: SearchContext = {
        query: pluginQuery,
        normalizedQuery: pluginQuery.toLowerCase(),
        now: Date.now(),
        scope: parseQuery(pluginQuery).scope,
        settings,
        usageByItemId,
        clipboardItems,
        snippets,
        workflows
      };

      const results = await options.pluginHost.search(pluginQuery, searchContext);
      if (results.length === 0) {
        return {
          ok: false,
          message: `Plugin command ${command} returned no results.`
        };
      }

      const target = results[0];
      const defaultAction = getDefaultAction(target);
      if (!defaultAction) {
        return {
          ok: false,
          message: `Plugin command ${command} produced a result without a default action.`
        };
      }

      if (defaultAction.kind === "run-plugin-action") {
        return options.pluginHost.runAction(defaultAction, target, settings);
      }

      return performAction(defaultAction, target);
    },
    async requestHttp(request: WorkflowHttpRequest) {
      return workflowHttpRequest(request);
    },
    async searchLauncher(query) {
      if (!options.searchLauncher) {
        return [];
      }

      return options.searchLauncher(query);
    },
    async emitToast(message) {
      await options.emitToast?.(message);
    }
  };

  return runWorkflow(workflow, context, services, {
    workflowCatalog: workflows
  });
}

export function getWorkflowResultSummary(run: WorkflowRunResult): string | undefined {
  if (run.failureStage === "validation") {
    return run.validationIssues[0]?.message ?? run.error;
  }

  if (run.returnedText) {
    return run.returnedText;
  }

  if (run.actionResponse?.message) {
    return run.actionResponse.message;
  }

  if (run.resultItems?.length) {
    return `${run.resultItems.length} launcher results returned.`;
  }

  if (run.ok) {
    return "Workflow completed.";
  }

  return run.error;
}

export function getWorkflowRunActionResponse(
  run: WorkflowRunResult
): ActionResponse | undefined {
  if (run.actionResponse) {
    return run.actionResponse;
  }

  if (run.returnedText) {
    return { ok: true, message: run.returnedText };
  }

  if (run.resultItems?.length) {
    return { ok: true, message: `${run.resultItems.length} workflow results returned.` };
  }

  return undefined;
}

export function findWorkflowById(
  workflows: WorkflowRecord[],
  workflowId: string
): WorkflowRecord | undefined {
  return workflows.find((workflow) => workflow.id === workflowId);
}
