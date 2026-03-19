import type {
  WorkflowEdge,
  WorkflowRecord,
  WorkflowValidationIssue,
  WorkflowValueType
} from "@osb/shared-types";

import {
  extractWorkflowTemplateReferences,
  validateWorkflowTemplateReference
} from "./workflow-references";
import { WORKFLOW_NODE_LIBRARY_BY_TYPE } from "./workflow-library";
import {
  createWorkflowTriggerRegistry,
  normalizeKeywordTrigger
} from "./workflow-triggers";

export interface WorkflowValidationOptions {
  workflowCatalog?: WorkflowRecord[];
}

export function validateWorkflow(
  workflow: WorkflowRecord,
  options: WorkflowValidationOptions = {}
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];

  if (!workflow.name.trim()) {
    issues.push({ level: "error", message: "Workflow name is required." });
  }

  if (!workflow.trigger.enabled) {
    issues.push({
      level: "warning",
      message:
        "Workflow trigger is disabled, so it will not appear in launcher discovery."
    });
  }

  if (workflow.trigger.type === "slash-command") {
    const command = workflow.trigger.command.trim();
    if (!command.startsWith("/")) {
      issues.push({
        level: "error",
        message: "Slash-command workflows must use a command that starts with '/'."
      });
    }
  }

  if (workflow.trigger.type === "keyword") {
    issues.push(...validateKeywordTrigger(workflow));
  }

  if (options.workflowCatalog) {
    issues.push(...validateWorkflowTriggerConflicts(workflow, options.workflowCatalog));
  }

  if (workflow.reusable) {
    issues.push(...validateReusableDefinition(workflow));
  }

  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, WorkflowEdge[]>();
  const outgoing = new Map<string, WorkflowEdge[]>();
  const nodeOutputPorts = new Map(
    workflow.nodes.map((node) => [
      node.id,
      new Set(
        WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type]?.outputs.map((port) => port.name) ?? []
      )
    ])
  );

  if (workflow.reusable) {
    for (const output of workflow.reusable.outputs) {
      for (const reference of extractWorkflowTemplateReferences(output.valueTemplate)) {
        const referenceError = validateWorkflowTemplateReference(reference, {
          workflowNodeIds: new Set(nodeById.keys()),
          workflowNodeOutputs: nodeOutputPorts
        });
        if (referenceError) {
          issues.push({
            level: "warning",
            message: `Reusable output '${output.name}' has an invalid reference: ${referenceError}`
          });
        }
      }
    }
  }

  for (const node of workflow.nodes) {
    const definition = WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type];
    if (!definition) {
      issues.push({
        level: "error",
        nodeId: node.id,
        message: `Unknown node type: ${node.type}.`
      });
      continue;
    }

    if (definition.status === "planned") {
      issues.push({
        level: "error",
        nodeId: node.id,
        message: `${definition.label} is planned only and is not executable in runtime v1.`
      });
    }
  }

  for (const edge of workflow.edges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);

    if (!fromNode) {
      issues.push({
        level: "error",
        message: `Edge ${edge.id} points to a missing source node.`
      });
      continue;
    }

    if (!toNode) {
      issues.push({
        level: "error",
        message: `Edge ${edge.id} points to a missing target node.`
      });
      continue;
    }

    const fromDefinition = WORKFLOW_NODE_LIBRARY_BY_TYPE[fromNode.type];
    const toDefinition = WORKFLOW_NODE_LIBRARY_BY_TYPE[toNode.type];

    if (!fromDefinition.outputs.some((port) => port.name === edge.fromPort)) {
      issues.push({
        level: "error",
        nodeId: fromNode.id,
        message: `${fromDefinition.label} has no output port '${edge.fromPort}'.`
      });
    }

    if (!toDefinition.inputs.some((port) => port.name === edge.toInput)) {
      issues.push({
        level: "error",
        nodeId: toNode.id,
        message: `${toDefinition.label} has no input port '${edge.toInput}'.`
      });
    }

    incoming.set(edge.toNodeId, [...(incoming.get(edge.toNodeId) ?? []), edge]);
    outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge]);
  }

  const roots = workflow.nodes.filter(
    (node) => (incoming.get(node.id)?.length ?? 0) === 0
  );
  if (roots.length === 0) {
    issues.push({
      level: "error",
      message: "Workflow must have at least one starting node with no incoming edges."
    });
  }

  if (
    hasCycle(
      workflow.nodes.map((node) => node.id),
      workflow.edges
    )
  ) {
    issues.push({
      level: "error",
      message: "Workflow graph contains a cycle. Runtime v1 only supports acyclic flows."
    });
  }

  for (const node of workflow.nodes) {
    const definition = WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type];
    if (!definition) {
      continue;
    }

    const inbound = incoming.get(node.id) ?? [];
    const outbound = outgoing.get(node.id) ?? [];

    for (const input of definition.inputs.filter((port) => port.required)) {
      const satisfied =
        inbound.some((edge) => edge.toInput === input.name) ||
        nodeConfigProvidesInput(node.config, input.name);
      if (!satisfied) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `${definition.label} is missing required input '${input.name}'.`
        });
      }
    }

    if (node.type !== "conditional-branch" && outbound.length > 1) {
      issues.push({
        level: "error",
        nodeId: node.id,
        message:
          "Runtime v1 only supports a single default outgoing edge for non-branch nodes."
      });
    }

    if (node.type === "conditional-branch") {
      const allowedPorts = new Set(["true", "false"]);
      const invalidPort = outbound.find((edge) => !allowedPorts.has(edge.fromPort));
      if (invalidPort) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message:
            "Conditional Branch can only connect through the 'true' and 'false' outputs."
        });
      }
    }

    const nodeInputNames = new Set(definition.inputs.map((port) => port.name));
    for (const configString of collectStringConfigEntries(node.config)) {
      for (const reference of extractWorkflowTemplateReferences(configString.value)) {
        const referenceError = validateWorkflowTemplateReference(reference, {
          workflowNode: node,
          workflowNodeInputNames: nodeInputNames,
          workflowNodeIds: new Set(nodeById.keys()),
          workflowNodeOutputs: nodeOutputPorts,
          extraRoots:
            node.type === "show-launcher-results" ? new Set(["item", "index"]) : undefined
        });
        if (referenceError) {
          issues.push({
            level: "warning",
            nodeId: node.id,
            message: `${definition.label} has an invalid reference in ${configString.path}: ${referenceError}`
          });
        }
      }
    }

    issues.push(...validateNodeConfig(node, workflow, inbound, options.workflowCatalog));

    for (const edge of inbound) {
      const sourceType = resolveEdgeOutputType(
        workflow,
        edge,
        incoming,
        nodeById,
        new Map()
      );
      const targetPort = definition.inputs.find((port) => port.name === edge.toInput);
      if (!sourceType || !targetPort) {
        continue;
      }

      const acceptedTypes = targetPort.acceptedValueTypes ?? [targetPort.valueType];
      if (!isCompatibleType(sourceType, acceptedTypes)) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `${definition.label} input '${edge.toInput}' expects ${acceptedTypes.join(
            " or "
          )}, but edge ${edge.id} provides ${sourceType}.`
        });
      }
    }
  }

  const terminalNodes = workflow.nodes.filter((node) => {
    const definition = WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type];
    return definition?.category === "output";
  });

  if (terminalNodes.length === 0) {
    issues.push({
      level: "error",
      message: "Workflow must include at least one output node."
    });
  }

  return dedupeIssues(issues);
}

function validateKeywordTrigger(workflow: WorkflowRecord): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  if (workflow.trigger.type !== "keyword") {
    return issues;
  }

  const keywordTrigger = workflow.trigger;
  const keyword = keywordTrigger.keyword.trim();

  if (!keyword) {
    issues.push({
      level: "error",
      message: "Keyword-triggered workflows must declare a keyword."
    });
    return issues;
  }

  if (keyword.startsWith("/")) {
    issues.push({
      level: "error",
      message:
        "Keyword triggers must not start with '/'. Use Slash command for slash-prefixed entrypoints."
    });
  }

  if (/\s/.test(keyword)) {
    issues.push({
      level: "error",
      message:
        "Keyword triggers must use a single fixed prefix token such as 'gh' or 'jira'."
    });
  }

  const normalizedPrimary = normalizeKeywordTrigger(keyword);
  const seenAliases = new Set<string>([normalizedPrimary]);

  for (const alias of keywordTrigger.aliases ?? []) {
    const trimmed = alias.trim();
    if (!trimmed) {
      issues.push({
        level: "warning",
        message: "Empty keyword aliases are ignored."
      });
      continue;
    }

    if (trimmed.startsWith("/")) {
      issues.push({
        level: "error",
        message: `Keyword alias '${trimmed}' must not start with '/'.`
      });
    }

    if (/\s/.test(trimmed)) {
      issues.push({
        level: "error",
        message: `Keyword alias '${trimmed}' must be a single token.`
      });
    }

    const normalized = normalizeKeywordTrigger(trimmed);
    if (seenAliases.has(normalized)) {
      issues.push({
        level: "warning",
        message: `Keyword alias '${trimmed}' duplicates the primary keyword or another alias.`
      });
      continue;
    }

    seenAliases.add(normalized);
  }

  return issues;
}

function validateWorkflowTriggerConflicts(
  workflow: WorkflowRecord,
  workflowCatalog: WorkflowRecord[]
): WorkflowValidationIssue[] {
  const registry = createWorkflowTriggerRegistry(workflowCatalog);
  const issues: WorkflowValidationIssue[] = [];

  for (const registration of registry.registrations) {
    if (
      registration.workflowId !== workflow.id ||
      registration.state !== "shadowed" ||
      !registration.token
    ) {
      continue;
    }

    const triggerLabel =
      registration.triggerType === "keyword" ? "Keyword trigger" : "Slash command";
    issues.push({
      level: "warning",
      message: `${triggerLabel} '${registration.token}' is shadowed by '${registration.shadowedByLabel ?? "another workflow"}'. Pulse prefers custom workflows over built-ins, then newer workflows over older ones when triggers conflict.`
    });
  }

  return issues;
}

function nodeConfigProvidesInput(
  config: Record<string, unknown>,
  inputName: string
): boolean {
  const direct = config[inputName];
  if (typeof direct === "string") {
    return direct.trim().length > 0;
  }

  switch (inputName) {
    case "input":
      return hasStringConfig(config, "template");
    case "text":
      return (
        hasStringConfig(config, "template") || hasStringConfig(config, "textTemplate")
      );
    case "url":
      return (
        hasStringConfig(config, "template") || hasStringConfig(config, "urlTemplate")
      );
    case "path":
      return hasStringConfig(config, "pathTemplate");
    case "command":
      return hasStringConfig(config, "commandTemplate");
    case "query":
      return hasStringConfig(config, "queryTemplate");
    case "items":
      return hasStringConfig(config, "itemsTemplate");
    default:
      return false;
  }
}

function collectStringConfigEntries(
  config: Record<string, unknown>,
  path = "config"
): Array<{ path: string; value: string }> {
  const entries: Array<{ path: string; value: string }> = [];

  for (const [key, value] of Object.entries(config)) {
    const nextPath = `${path}.${key}`;
    if (typeof value === "string") {
      entries.push({ path: nextPath, value });
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      entries.push(
        ...collectStringConfigEntries(value as Record<string, unknown>, nextPath)
      );
    }
  }

  return entries;
}

function hasStringConfig(config: Record<string, unknown>, key: string): boolean {
  const value = config[key];
  return typeof value === "string" && value.trim().length > 0;
}

function resolveEdgeOutputType(
  workflow: WorkflowRecord,
  edge: WorkflowEdge,
  incoming: Map<string, WorkflowEdge[]>,
  nodeById: Map<string, WorkflowRecord["nodes"][number]>,
  memo: Map<string, WorkflowValueType | null>
): WorkflowValueType | null {
  const cacheKey = `${edge.fromNodeId}:${edge.fromPort}`;
  if (memo.has(cacheKey)) {
    return memo.get(cacheKey) ?? null;
  }

  const node = nodeById.get(edge.fromNodeId);
  if (!node) {
    return null;
  }

  const type = resolveNodeOutputType(
    workflow,
    node,
    edge.fromPort,
    incoming,
    nodeById,
    memo
  );
  memo.set(cacheKey, type);
  return type;
}

function resolveNodeOutputType(
  _workflow: WorkflowRecord,
  node: WorkflowRecord["nodes"][number],
  portName: string,
  incoming: Map<string, WorkflowEdge[]>,
  nodeById: Map<string, WorkflowRecord["nodes"][number]>,
  memo: Map<string, WorkflowValueType | null>
): WorkflowValueType | null {
  switch (node.type) {
    case "query-input":
    case "clipboard-input":
    case "regex-replace":
    case "return-text":
      return "text";
    case "static-value":
      return normalizeValueType(node.config.valueType) ?? "text";
    case "http-request":
      switch (portName) {
        case "status":
          return "number";
        case "ok":
          return "boolean";
        case "text":
          return "text";
        case "json":
        case "headers":
          return "object";
        default:
          return "http-response";
      }
    case "invoke-workflow":
      return "object";
    case "template":
      return normalizeValueType(node.config.outputType) ?? "text";
    case "conditional-branch": {
      const sourceEdge = (incoming.get(node.id) ?? []).find(
        (edge) => edge.toInput === "input"
      );
      return sourceEdge
        ? resolveEdgeOutputType(_workflow, sourceEdge, incoming, nodeById, memo)
        : "text";
    }
    case "json-parse":
      return "object";
    case "json-extract":
      return normalizeValueType(node.config.outputType) ?? "object";
    case "open-url":
    case "copy-to-clipboard":
    case "open-file":
    case "run-shell-command":
    case "invoke-shared-action":
    case "invoke-plugin-command":
    case "return-action-result":
    case "emit-toast":
      return "action-result";
    case "show-launcher-results":
      return "result-list";
    case "file-input":
      return "file";
    case "return-files":
      return "file-list";
  }
}

function normalizeValueType(value: unknown): WorkflowValueType | undefined {
  switch (value) {
    case "text":
    case "url":
    case "number":
    case "boolean":
    case "object":
    case "http-response":
    case "json":
    case "file":
    case "file-list":
    case "action-result":
    case "result-list":
    case "void":
      return value;
    default:
      return undefined;
  }
}

function isCompatibleType(
  actualType: WorkflowValueType,
  acceptedTypes: WorkflowValueType[]
): boolean {
  if (acceptedTypes.includes(actualType)) {
    return true;
  }

  return (
    (actualType === "url" && acceptedTypes.includes("text")) ||
    (actualType === "text" && acceptedTypes.includes("url")) ||
    (actualType === "number" && acceptedTypes.includes("text")) ||
    (actualType === "http-response" && acceptedTypes.includes("object")) ||
    (actualType === "json" && acceptedTypes.includes("object")) ||
    (actualType === "object" && acceptedTypes.includes("json"))
  );
}

function validateNodeConfig(
  node: WorkflowRecord["nodes"][number],
  workflow: WorkflowRecord,
  inbound: WorkflowEdge[],
  workflowCatalog?: WorkflowRecord[]
): WorkflowValidationIssue[] {
  switch (node.type) {
    case "http-request":
      return validateHttpRequestNode(node);
    case "invoke-workflow":
      return validateInvokeWorkflowNode(node, workflow, inbound, workflowCatalog);
    case "show-launcher-results":
      return validateShowLauncherResultsNode(node, inbound);
    default:
      return [];
  }
}

function validateHttpRequestNode(
  node: WorkflowRecord["nodes"][number]
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const method = String(node.config.method ?? "GET").toUpperCase();

  if (method !== "GET" && method !== "POST") {
    issues.push({
      level: "error",
      nodeId: node.id,
      message: "HTTP Request only supports GET and POST in runtime v1."
    });
  }

  if (!hasStringConfig(node.config, "urlTemplate")) {
    issues.push({
      level: "error",
      nodeId: node.id,
      message: "HTTP Request requires a URL template."
    });
  }

  const timeoutValue = node.config.timeoutMs;
  if (
    timeoutValue !== undefined &&
    timeoutValue !== null &&
    (!Number.isFinite(Number(timeoutValue)) || Number(timeoutValue) <= 0)
  ) {
    issues.push({
      level: "warning",
      nodeId: node.id,
      message: "HTTP Request timeout should be a positive number of milliseconds."
    });
  }

  return issues;
}

function validateShowLauncherResultsNode(
  node: WorkflowRecord["nodes"][number],
  inbound: WorkflowEdge[]
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const mode = String(node.config.mode ?? "query");

  if (mode === "items") {
    if (!inbound.some((edge) => edge.toInput === "items")) {
      issues.push({
        level: "error",
        nodeId: node.id,
        message: "Show Launcher Results in items mode requires an incoming 'items' edge."
      });
    }

    if (!hasStringConfig(node.config, "titleTemplate")) {
      issues.push({
        level: "error",
        nodeId: node.id,
        message: "Show Launcher Results items mode requires a title template."
      });
    }

    if (!hasStringConfig(node.config, "actionKind")) {
      issues.push({
        level: "warning",
        nodeId: node.id,
        message: "Show Launcher Results items mode should define a default action kind."
      });
    }
  } else if (
    !inbound.some((edge) => edge.toInput === "query") &&
    !hasStringConfig(node.config, "queryTemplate")
  ) {
    issues.push({
      level: "error",
      nodeId: node.id,
      message:
        "Show Launcher Results query mode requires a query input or query template."
    });
  }

  return issues;
}

function validateReusableDefinition(workflow: WorkflowRecord): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const reusable = workflow.reusable;
  if (!reusable) {
    return issues;
  }

  const inputNames = new Set<string>();
  for (const input of reusable.inputs) {
    if (!input.name.trim()) {
      issues.push({
        level: "error",
        message: "Reusable workflow inputs must have a name."
      });
      continue;
    }

    if (inputNames.has(input.name)) {
      issues.push({
        level: "error",
        message: `Reusable workflow input '${input.name}' is duplicated.`
      });
    }
    inputNames.add(input.name);
  }

  const outputNames = new Set<string>();
  for (const output of reusable.outputs) {
    if (!output.name.trim()) {
      issues.push({
        level: "error",
        message: "Reusable workflow outputs must have a name."
      });
      continue;
    }

    if (!output.valueTemplate.trim()) {
      issues.push({
        level: "error",
        message: `Reusable workflow output '${output.name}' requires a value template.`
      });
    }

    if (outputNames.has(output.name)) {
      issues.push({
        level: "error",
        message: `Reusable workflow output '${output.name}' is duplicated.`
      });
    }
    outputNames.add(output.name);
  }

  return issues;
}

function validateInvokeWorkflowNode(
  node: WorkflowRecord["nodes"][number],
  workflow: WorkflowRecord,
  inbound: WorkflowEdge[],
  workflowCatalog?: WorkflowRecord[]
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const workflowId = String(node.config.workflowId ?? "").trim();
  if (!workflowId) {
    issues.push({
      level: "error",
      nodeId: node.id,
      message: "Invoke Workflow requires a reusable workflow id."
    });
    return issues;
  }

  if (workflowId === workflow.id) {
    issues.push({
      level: "error",
      nodeId: node.id,
      message: "Invoke Workflow cannot recursively call its own workflow."
    });
  }

  if (!workflowCatalog) {
    issues.push({
      level: "warning",
      nodeId: node.id,
      message:
        "Invoke Workflow validation needs the workflow catalog to verify targets and contracts."
    });
    return issues;
  }

  const target = workflowCatalog.find((entry) => entry.id === workflowId);
  if (!target) {
    issues.push({
      level: "error",
      nodeId: node.id,
      message: `Invoke Workflow references missing workflow '${workflowId}'.`
    });
    return issues;
  }

  if (!target.reusable) {
    issues.push({
      level: "error",
      nodeId: node.id,
      message: `Invoke Workflow can only call reusable workflows. '${target.name}' is not marked reusable.`
    });
    return issues;
  }

  if (
    workflowDependencyReaches(
      target.id,
      workflow.id,
      workflowCatalog,
      new Set([workflow.id])
    )
  ) {
    issues.push({
      level: "error",
      nodeId: node.id,
      message: `Invoke Workflow introduces a workflow dependency cycle through '${target.name}'.`
    });
  }

  const inputTemplates = toRecord(node.config.inputTemplates);
  const hasPassThroughInput = inbound.some((edge) => edge.toInput === "input");
  const contract = target.reusable;
  for (const input of contract.inputs.filter((entry) => entry.required !== false)) {
    const hasExplicitTemplate = hasStringRecordValue(inputTemplates, input.name);
    const canUsePassThrough = contract.inputs.length === 1 && hasPassThroughInput;
    if (!hasExplicitTemplate && !canUsePassThrough) {
      issues.push({
        level: "error",
        nodeId: node.id,
        message: `Invoke Workflow is missing required reusable input '${input.name}' for '${target.name}'.`
      });
    }
  }

  for (const key of Object.keys(inputTemplates)) {
    if (!contract.inputs.some((input) => input.name === key)) {
      issues.push({
        level: "warning",
        nodeId: node.id,
        message: `Invoke Workflow passes unknown reusable input '${key}' to '${target.name}'.`
      });
    }
  }

  if (contract.outputs.length === 0) {
    issues.push({
      level: "warning",
      nodeId: node.id,
      message: `Reusable workflow '${target.name}' does not currently declare any outputs.`
    });
  }

  return issues;
}

function workflowDependencyReaches(
  startWorkflowId: string,
  targetWorkflowId: string,
  workflowCatalog: WorkflowRecord[],
  visiting: Set<string>
): boolean {
  if (startWorkflowId === targetWorkflowId) {
    return true;
  }

  if (visiting.has(startWorkflowId)) {
    return false;
  }
  visiting.add(startWorkflowId);

  const workflow = workflowCatalog.find((entry) => entry.id === startWorkflowId);
  if (!workflow) {
    return false;
  }

  const dependencies = workflow.nodes
    .filter((node) => node.type === "invoke-workflow")
    .map((node) => String(node.config.workflowId ?? "").trim())
    .filter(Boolean);

  for (const dependency of dependencies) {
    if (
      workflowDependencyReaches(
        dependency,
        targetWorkflowId,
        workflowCatalog,
        new Set(visiting)
      )
    ) {
      return true;
    }
  }

  return false;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasStringRecordValue(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0;
}

function hasCycle(nodeIds: string[], edges: WorkflowEdge[]): boolean {
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    if (!indegree.has(edge.toNodeId) || !indegree.has(edge.fromNodeId)) {
      continue;
    }

    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
    outgoing.set(edge.fromNodeId, [
      ...(outgoing.get(edge.fromNodeId) ?? []),
      edge.toNodeId
    ]);
  }

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  let visited = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;

    for (const next of outgoing.get(current) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
      }
    }
  }

  return visited !== nodeIds.length;
}

function dedupeIssues(issues: WorkflowValidationIssue[]): WorkflowValidationIssue[] {
  const seen = new Set<string>();
  const unique: WorkflowValidationIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.level}:${issue.nodeId ?? "workflow"}:${issue.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(issue);
  }

  return unique;
}
