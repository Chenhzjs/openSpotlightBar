import type {
  WorkflowKeywordTrigger,
  WorkflowRecord,
  WorkflowSlashCommandTrigger,
  WorkflowTriggerType
} from "@osb/shared-types";

export interface ParsedSlashCommandInvocation {
  command: string;
  argsText: string;
  rawInput: string;
}

export interface ParsedKeywordTriggerInvocation {
  keyword: string;
  argsText: string;
  rawInput: string;
}

export interface WorkflowTriggerRegistration {
  workflow: WorkflowRecord;
  workflowId: string;
  workflowName: string;
  triggerType: WorkflowTriggerType;
  label: string;
  enabled: boolean;
  discoverable: boolean;
  token?: string;
  normalizedToken?: string;
  isAlias: boolean;
  argumentName: string;
  placeholder?: string;
  exampleInvocation?: string;
  searchText: string;
  state: "active" | "shadowed" | "disabled" | "manual-only" | "hotkey-only";
  shadowedByWorkflowId?: string;
  shadowedByLabel?: string;
}

export interface WorkflowTriggerRegistry {
  registrations: WorkflowTriggerRegistration[];
  activeRegistrations: WorkflowTriggerRegistration[];
}

export interface WorkflowTriggerInvocationMatch {
  registration: WorkflowTriggerRegistration;
  workflow: WorkflowRecord;
  rawInput: string;
  argsText: string;
  matchedToken: string;
}

export function parseSlashCommandInvocation(
  query: string
): ParsedSlashCommandInvocation | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  return {
    command: normalizeSlashCommand(command),
    argsText: rest.join(" ").trim(),
    rawInput: trimmed
  };
}

export function normalizeSlashCommand(command: string): string {
  const trimmed = command.trim().toLowerCase();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function parseKeywordTriggerInvocation(
  query: string
): ParsedKeywordTriggerInvocation | null {
  const trimmed = query.trim();
  if (!trimmed || trimmed.startsWith("/")) {
    return null;
  }

  const [keyword, ...rest] = trimmed.split(/\s+/);
  return {
    keyword: normalizeKeywordTrigger(keyword),
    argsText: rest.join(" ").trim(),
    rawInput: trimmed
  };
}

export function normalizeKeywordTrigger(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getWorkflowSlashCommand(
  workflow: WorkflowRecord
): WorkflowSlashCommandTrigger | null {
  return workflow.trigger.type === "slash-command" ? workflow.trigger : null;
}

export function getWorkflowKeywordTrigger(
  workflow: WorkflowRecord
): WorkflowKeywordTrigger | null {
  return workflow.trigger.type === "keyword" ? workflow.trigger : null;
}

export function getWorkflowPrimaryArgumentName(workflow: WorkflowRecord): string {
  switch (workflow.trigger.type) {
    case "slash-command":
      return workflow.trigger.argumentName?.trim() || "query";
    case "keyword":
      return workflow.trigger.argumentName?.trim() || "query";
    default:
      return "query";
  }
}

export function getWorkflowTriggerPlaceholder(
  workflow: WorkflowRecord
): string | undefined {
  switch (workflow.trigger.type) {
    case "slash-command":
    case "keyword":
      return workflow.trigger.placeholder?.trim() || undefined;
    default:
      return undefined;
  }
}

export function getWorkflowTriggerDisplayLabel(workflow: WorkflowRecord): string {
  switch (workflow.trigger.type) {
    case "slash-command":
      return workflow.trigger.command;
    case "keyword":
      return workflow.trigger.keyword;
    case "hotkey":
      return workflow.trigger.hotkey;
    case "manual":
      return "Manual";
  }
}

export function getWorkflowTriggerExampleInvocation(
  workflow: WorkflowRecord
): string | undefined {
  const placeholder = getWorkflowTriggerPlaceholder(workflow);
  const argumentName = getWorkflowPrimaryArgumentName(workflow);
  const exampleSuffix =
    placeholder && !/no input|required|clipboard/i.test(placeholder)
      ? placeholder
      : placeholder
        ? undefined
        : `<${argumentName}>`;

  switch (workflow.trigger.type) {
    case "slash-command":
      return [workflow.trigger.command, exampleSuffix].filter(Boolean).join(" ");
    case "keyword":
      return [workflow.trigger.keyword, exampleSuffix].filter(Boolean).join(" ");
    case "hotkey":
      return workflow.trigger.hotkey;
    case "manual":
      return undefined;
  }
}

export function createWorkflowTriggerRegistry(
  workflows: WorkflowRecord[]
): WorkflowTriggerRegistry {
  const registrations = workflows.flatMap((workflow) =>
    createWorkflowTriggerRegistrations(workflow)
  );
  const discoverableGroups = new Map<string, WorkflowTriggerRegistration[]>();

  for (const registration of registrations) {
    if (
      !registration.discoverable ||
      registration.state === "disabled" ||
      !registration.normalizedToken
    ) {
      continue;
    }

    const key = `${registration.triggerType}:${registration.normalizedToken}`;
    discoverableGroups.set(key, [...(discoverableGroups.get(key) ?? []), registration]);
  }

  for (const group of discoverableGroups.values()) {
    const ordered = [...group].sort(compareTriggerPriority);
    const winner = ordered[0];
    if (!winner) {
      continue;
    }

    winner.state = "active";
    for (const loser of ordered.slice(1)) {
      loser.state = "shadowed";
      loser.shadowedByWorkflowId = winner.workflowId;
      loser.shadowedByLabel = winner.label;
    }
  }

  const activeRegistrations = registrations.filter(
    (registration) => registration.state === "active"
  );

  return {
    registrations,
    activeRegistrations
  };
}

export function matchWorkflowTriggerInvocation(
  query: string,
  registry: WorkflowTriggerRegistry
): WorkflowTriggerInvocationMatch | null {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    const invocation = parseSlashCommandInvocation(trimmed);
    if (!invocation) {
      return null;
    }

    const registration = registry.activeRegistrations.find(
      (entry) =>
        entry.triggerType === "slash-command" &&
        entry.normalizedToken === invocation.command
    );
    if (!registration) {
      return null;
    }

    return {
      registration,
      workflow: registration.workflow,
      rawInput: invocation.rawInput,
      argsText: invocation.argsText,
      matchedToken: registration.token ?? invocation.command
    };
  }

  const invocation = parseKeywordTriggerInvocation(trimmed);
  if (!invocation) {
    return null;
  }

  const registration = registry.activeRegistrations.find(
    (entry) =>
      entry.triggerType === "keyword" && entry.normalizedToken === invocation.keyword
  );
  if (!registration) {
    return null;
  }

  return {
    registration,
    workflow: registration.workflow,
    rawInput: invocation.rawInput,
    argsText: invocation.argsText,
    matchedToken: registration.token ?? invocation.keyword
  };
}

function createWorkflowTriggerRegistrations(
  workflow: WorkflowRecord
): WorkflowTriggerRegistration[] {
  const discoverable =
    workflow.enabled &&
    workflow.trigger.enabled &&
    (workflow.trigger.type === "slash-command" || workflow.trigger.type === "keyword");
  const argumentName = getWorkflowPrimaryArgumentName(workflow);
  const placeholder = getWorkflowTriggerPlaceholder(workflow);
  const exampleInvocation = getWorkflowTriggerExampleInvocation(workflow);
  const baseRegistration = {
    workflow,
    workflowId: workflow.id,
    workflowName: workflow.name,
    triggerType: workflow.trigger.type,
    enabled: workflow.enabled && workflow.trigger.enabled,
    discoverable,
    argumentName,
    placeholder,
    exampleInvocation,
    label: workflow.trigger.label,
    state: discoverable
      ? ("active" as const)
      : workflow.trigger.type === "manual"
        ? ("manual-only" as const)
        : workflow.trigger.type === "hotkey"
          ? ("hotkey-only" as const)
          : ("disabled" as const)
  };

  switch (workflow.trigger.type) {
    case "slash-command":
      return [
        {
          ...baseRegistration,
          token: workflow.trigger.command,
          normalizedToken: normalizeSlashCommand(workflow.trigger.command),
          isAlias: false,
          searchText: buildRegistrationSearchText(workflow, workflow.trigger.command, [])
        }
      ];
    case "keyword": {
      const keyword = normalizeKeywordTrigger(workflow.trigger.keyword);
      const primaryToken = workflow.trigger.keyword.trim();
      const aliases = (workflow.trigger.aliases ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean);
      const registrations: WorkflowTriggerRegistration[] = [
        {
          ...baseRegistration,
          token: primaryToken,
          normalizedToken: keyword,
          isAlias: false,
          searchText: buildRegistrationSearchText(workflow, primaryToken, aliases)
        }
      ];

      for (const alias of aliases) {
        registrations.push({
          ...baseRegistration,
          token: alias,
          normalizedToken: normalizeKeywordTrigger(alias),
          isAlias: true,
          label: `${primaryToken} alias`,
          searchText: buildRegistrationSearchText(workflow, primaryToken, aliases)
        });
      }

      return registrations;
    }
    case "hotkey":
    case "manual":
      return [
        {
          ...baseRegistration,
          isAlias: false,
          searchText: buildRegistrationSearchText(workflow)
        }
      ];
  }
}

function compareTriggerPriority(
  left: WorkflowTriggerRegistration,
  right: WorkflowTriggerRegistration
): number {
  if (left.workflow.builtIn !== right.workflow.builtIn) {
    return left.workflow.builtIn ? 1 : -1;
  }

  if (left.workflow.updatedAt !== right.workflow.updatedAt) {
    return right.workflow.updatedAt - left.workflow.updatedAt;
  }

  if (left.workflow.createdAt !== right.workflow.createdAt) {
    return right.workflow.createdAt - left.workflow.createdAt;
  }

  if (left.isAlias !== right.isAlias) {
    return left.isAlias ? 1 : -1;
  }

  return left.workflowId.localeCompare(right.workflowId);
}

function buildRegistrationSearchText(
  workflow: WorkflowRecord,
  token?: string,
  aliases: string[] = []
): string {
  return [
    workflow.name,
    workflow.description ?? "",
    token ?? "",
    aliases.join(" "),
    workflow.tags.join(" "),
    workflow.trigger.label
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
