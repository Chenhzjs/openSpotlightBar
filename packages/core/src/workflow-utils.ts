import type {
  WorkflowRecord,
  WorkflowRunContext
} from "@pulse/shared-types";

import {
  getWorkflowKeywordTrigger,
  getWorkflowPrimaryArgumentName,
  getWorkflowSlashCommand,
  normalizeKeywordTrigger,
  normalizeSlashCommand,
  parseKeywordTriggerInvocation,
  parseSlashCommandInvocation
} from "./workflow-triggers";

export function buildWorkflowRunContext(
  workflow: WorkflowRecord,
  query: string,
  options?: {
    clipboardText?: string;
    files?: string[];
    launcherQuery?: string;
  }
): WorkflowRunContext {
  const trigger = workflow.trigger;
  const argumentName = getWorkflowPrimaryArgumentName(workflow);
  const trimmed = query.trim();
  const slashInvocation =
    trigger.type === "slash-command" ? parseSlashCommandInvocation(query) : null;
  const keywordInvocation =
    trigger.type === "keyword" ? parseKeywordTriggerInvocation(query) : null;
  const slashCommand = getWorkflowSlashCommand(workflow)?.command;
  const keywordTrigger = getWorkflowKeywordTrigger(workflow);
  const matchesKeyword = Boolean(
    keywordInvocation &&
      keywordTrigger &&
      new Set([
        normalizeKeywordTrigger(keywordTrigger.keyword),
        ...(keywordTrigger.aliases ?? []).map(normalizeKeywordTrigger)
      ]).has(keywordInvocation.keyword)
  );
  const argsText =
    trigger.type === "slash-command"
      ? slashInvocation?.command === normalizeSlashCommand(trigger.command)
        ? slashInvocation.argsText
        : trimmed
      : trigger.type === "keyword"
        ? matchesKeyword
          ? keywordInvocation?.argsText ?? ""
          : trimmed
        : trimmed;

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    triggerType: workflow.trigger.type,
    invokedAt: Date.now(),
    query,
    rawInput:
      (trigger.type === "slash-command"
        ? slashInvocation?.rawInput
        : trigger.type === "keyword" && matchesKeyword
          ? keywordInvocation?.rawInput
          : undefined) ?? query,
    slashCommand,
    argsText,
    argsByName: {
      [argumentName]: argsText
    },
    launcherQuery: options?.launcherQuery ?? query,
    clipboardText: options?.clipboardText,
    files: options?.files
  };
}

export function buildReusableWorkflowRunContext(
  workflow: WorkflowRecord,
  inputs: Record<string, unknown>,
  parentContext: Pick<
    WorkflowRunContext,
    "clipboardText" | "files" | "launcherQuery"
  >
): WorkflowRunContext {
  const inputEntries = Object.entries(inputs);
  const firstScalar = inputEntries.find(([, value]) => typeof value === "string")?.[1];
  const argsText =
    typeof firstScalar === "string"
      ? firstScalar
      : inputEntries.length === 1
        ? stringifyWorkflowContextValue(inputEntries[0]?.[1])
        : JSON.stringify(inputs);

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    triggerType: "manual",
    invokedAt: Date.now(),
    query: workflow.name,
    rawInput: argsText,
    argsText,
    argsByName: inputs,
    launcherQuery: parentContext.launcherQuery,
    clipboardText: parentContext.clipboardText,
    files: parentContext.files
  };
}

function stringifyWorkflowContextValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
