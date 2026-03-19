import type {
  WorkflowNode,
  WorkflowRunContext,
  WorkflowValueType
} from "@osb/shared-types";

export interface WorkflowReferenceValue {
  type?: WorkflowValueType;
  value: unknown;
}

export interface WorkflowReferenceEnvironment {
  context: WorkflowRunContext;
  inputs?: Record<string, WorkflowReferenceValue>;
  nodeOutputs?: Map<string, Record<string, WorkflowReferenceValue>>;
  extraValues?: Record<string, WorkflowReferenceValue>;
}

export interface WorkflowTemplateReference {
  raw: string;
  expression: string;
  path: string[];
  filters: string[];
}

const TEMPLATE_REFERENCE_PATTERN = /\{\{\s*([^}]+)\s*\}\}/g;

export function extractWorkflowTemplateReferences(
  template: string
): WorkflowTemplateReference[] {
  const references: WorkflowTemplateReference[] = [];

  for (const match of template.matchAll(TEMPLATE_REFERENCE_PATTERN)) {
    const rawExpression = String(match[1] ?? "").trim();
    const [pathExpression, ...filters] = rawExpression
      .split("|")
      .map((part) => part.trim());
    references.push({
      raw: match[0],
      expression: pathExpression,
      path: pathExpression
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean),
      filters: filters.filter(Boolean)
    });
  }

  return references;
}

export function resolveWorkflowTemplateValue(
  template: string,
  environment: WorkflowReferenceEnvironment
): unknown {
  const references = extractWorkflowTemplateReferences(template);
  const trimmed = template.trim();

  if (
    references.length === 1 &&
    references[0]?.raw === trimmed &&
    trimmed.startsWith("{{") &&
    trimmed.endsWith("}}")
  ) {
    return resolveWorkflowReferenceExpression(references[0], environment).value;
  }

  return renderWorkflowTemplate(template, environment);
}

export function renderWorkflowTemplate(
  template: string,
  environment: WorkflowReferenceEnvironment
): string {
  return template.replace(TEMPLATE_REFERENCE_PATTERN, (_match, token: string) => {
    const parsed = extractWorkflowTemplateReferences(`{{${token}}}`)[0];
    if (!parsed) {
      return "";
    }
    const resolved = resolveWorkflowReferenceExpression(parsed, environment);
    return stringifyWorkflowReferenceValue(resolved.value);
  });
}

export function validateWorkflowTemplateReference(
  reference: WorkflowTemplateReference,
  options: {
    workflowNode?: WorkflowNode;
    workflowNodeInputNames?: Set<string>;
    workflowNodeIds?: Set<string>;
    workflowNodeOutputs?: Map<string, Set<string>>;
    extraRoots?: Set<string>;
  }
): string | null {
  if (reference.path.length === 0) {
    return "Empty workflow reference.";
  }

  const [root, second, third] = reference.path;
  switch (root) {
    case "args":
    case "context":
      return null;
    case "inputs": {
      if (!second) {
        return "Input references must use the form inputs.<inputName>.";
      }
      if (!options.workflowNodeInputNames) {
        return null;
      }
      if (!options.workflowNodeInputNames.has(second)) {
        return `Reference uses unknown input '${second}' for this node.`;
      }
      return null;
    }
    case "nodes": {
      if (!second || !third) {
        return "Node references must use the form nodes.<nodeId>.<portName>.";
      }
      if (options.workflowNodeIds && !options.workflowNodeIds.has(second)) {
        return `Reference uses unknown node '${second}'.`;
      }
      const ports = options.workflowNodeOutputs?.get(second);
      if (ports && !ports.has(third)) {
        return `Reference uses unknown output '${third}' on node '${second}'.`;
      }
      return null;
    }
    default:
      if (options.extraRoots?.has(root)) {
        return null;
      }
      if (LEGACY_ALIASES.has(root)) {
        return null;
      }
      return `Unsupported reference root '${root}'.`;
  }
}

export function stringifyWorkflowReferenceValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveWorkflowReferenceExpression(
  reference: WorkflowTemplateReference,
  environment: WorkflowReferenceEnvironment
): WorkflowReferenceValue {
  const baseValue = resolveReferencePath(reference.path, environment);
  return {
    type: baseValue.type,
    value: applyFilters(baseValue.value, reference.filters)
  };
}

function resolveReferencePath(
  path: string[],
  environment: WorkflowReferenceEnvironment
): WorkflowReferenceValue {
  const [root, second, third, ...rest] = path;

  if (!root) {
    return { value: undefined };
  }

  if (LEGACY_ALIASES.has(root)) {
    return resolveLegacyReference(
      root,
      rest.length > 0 ? [second, third, ...rest].filter(Boolean) : [],
      environment
    );
  }

  switch (root) {
    case "args":
      return {
        type: "text",
        value: dig(
          environment.context.argsByName,
          [second, third, ...rest].filter(Boolean)
        )
      };
    case "context":
      return {
        value: dig(
          buildContextReferenceMap(environment.context),
          [second, third, ...rest].filter(Boolean)
        )
      };
    case "inputs": {
      const target = second ? environment.inputs?.[second] : undefined;
      return {
        type: target?.type,
        value:
          rest.length > 0 || third
            ? dig(target?.value, [third, ...rest].filter(Boolean))
            : target?.value
      };
    }
    case "nodes": {
      const portValue =
        second && third ? environment.nodeOutputs?.get(second)?.[third] : undefined;
      return {
        type: portValue?.type,
        value: rest.length > 0 ? dig(portValue?.value, rest) : portValue?.value
      };
    }
    default:
      if (environment.extraValues?.[root]) {
        const value = environment.extraValues[root];
        return {
          type: value.type,
          value:
            rest.length > 0 || second
              ? dig(value.value, [second, third, ...rest].filter(Boolean))
              : value.value
        };
      }
      return { value: undefined };
  }
}

function resolveLegacyReference(
  root: string,
  rest: string[],
  environment: WorkflowReferenceEnvironment
): WorkflowReferenceValue {
  switch (root) {
    case "query":
      return { type: "text", value: environment.context.argsText ?? "" };
    case "rawInput":
      return { type: "text", value: environment.context.rawInput };
    case "slashCommand":
      return { type: "text", value: environment.context.slashCommand ?? "" };
    case "clipboard":
      return { type: "text", value: environment.context.clipboardText ?? "" };
    case "input":
    case "text":
    case "url": {
      const input = environment.inputs?.[root === "input" ? "input" : root];
      return {
        type: input?.type,
        value: rest.length > 0 ? dig(input?.value, rest) : input?.value
      };
    }
    default:
      return { value: undefined };
  }
}

function buildContextReferenceMap(context: WorkflowRunContext): Record<string, unknown> {
  return {
    query: context.query,
    rawInput: context.rawInput,
    argsText: context.argsText ?? "",
    launcherQuery: context.launcherQuery,
    slashCommand: context.slashCommand ?? "",
    clipboard: context.clipboardText ?? "",
    workflowId: context.workflowId,
    workflowName: context.workflowName,
    triggerType: context.triggerType,
    invokedAt: context.invokedAt,
    args: context.argsByName,
    files: context.files ?? []
  };
}

function applyFilters(value: unknown, filters: string[]): unknown {
  return filters.reduce<unknown>((current, filter) => {
    switch (filter.toLowerCase()) {
      case "trim":
        return stringifyWorkflowReferenceValue(current).trim();
      case "lower":
        return stringifyWorkflowReferenceValue(current).toLowerCase();
      case "upper":
        return stringifyWorkflowReferenceValue(current).toUpperCase();
      case "urlencode":
        return encodeURIComponent(stringifyWorkflowReferenceValue(current));
      case "json":
        return JSON.stringify(current);
      case "prettyjson":
        return JSON.stringify(current, null, 2);
      default:
        return current;
    }
  }, value);
}

function dig(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      return Number.isNaN(index) ? undefined : current[index];
    }

    if (typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, value);
}

const LEGACY_ALIASES = new Set([
  "query",
  "rawInput",
  "slashCommand",
  "clipboard",
  "input",
  "text",
  "url"
]);

/* ── Implicit node dependency extraction ── */

export interface ImplicitNodeDependency {
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  expression: string;
}

/**
 * Scans all string config values in a workflow's nodes for `{{nodes.X.Y}}`
 * template references and returns implicit data dependencies that are NOT
 * already covered by explicit edges.
 */
export function extractImplicitNodeDependencies(workflow: {
  nodes: WorkflowNode[];
  edges: { fromNodeId: string; fromPort: string; toNodeId: string }[];
}): ImplicitNodeDependency[] {
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));
  const explicitEdgeKeys = new Set(
    workflow.edges.map((e) => `${e.fromNodeId}:${e.fromPort}:${e.toNodeId}`)
  );

  const results: ImplicitNodeDependency[] = [];
  const seen = new Set<string>();

  for (const node of workflow.nodes) {
    if (!node.config) continue;
    const strings = collectConfigStrings(node.config);
    for (const str of strings) {
      const refs = extractWorkflowTemplateReferences(str);
      for (const ref of refs) {
        if (ref.path[0] !== "nodes" || !ref.path[1] || !ref.path[2]) continue;
        const fromNodeId = ref.path[1];
        const fromPort = ref.path[2];
        if (!nodeIds.has(fromNodeId)) continue;
        if (fromNodeId === node.id) continue;
        const edgeKey = `${fromNodeId}:${fromPort}:${node.id}`;
        if (explicitEdgeKeys.has(edgeKey)) continue;
        const dedupKey = `${fromNodeId}:${fromPort}:${node.id}:${ref.expression}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        results.push({
          fromNodeId,
          fromPort,
          toNodeId: node.id,
          expression: ref.expression
        });
      }
    }
  }

  return results;
}

function collectConfigStrings(config: Record<string, unknown>): string[] {
  const strings: string[] = [];
  function walk(value: unknown) {
    if (typeof value === "string") {
      strings.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) walk(v);
    }
  }
  walk(config);
  return strings;
}
