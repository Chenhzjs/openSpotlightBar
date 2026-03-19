import { WORKFLOW_NODE_LIBRARY, WORKFLOW_NODE_LIBRARY_BY_TYPE } from "@osb/core";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRecord
} from "@osb/shared-types";

export { WORKFLOW_NODE_LIBRARY, WORKFLOW_NODE_LIBRARY_BY_TYPE };

export function cloneWorkflow(workflow: WorkflowRecord): WorkflowRecord {
  return JSON.parse(JSON.stringify(workflow)) as WorkflowRecord;
}

export function createWorkflowDraft(): WorkflowRecord {
  const now = Date.now();
  const workflowId = `workflow-${now.toString(36)}`;

  return {
    id: workflowId,
    name: "New Workflow",
    description: "Describe what this launcher command or keyword should automate.",
    enabled: true,
    builtIn: false,
    reusable: null,
    tags: ["custom"],
    trigger: {
      type: "slash-command",
      label: "/new-command",
      enabled: true,
      command: "/new-command",
      argumentName: "query",
      placeholder: "Arguments"
    },
    nodes: [
      createNodeDraft("query-input"),
      createNodeDraft("return-text")
    ].map((node, index) => ({
      ...node,
      id: `${workflowId}-node-${index + 1}`
    })),
    edges: [
      {
        id: `${workflowId}-edge-1`,
        fromNodeId: `${workflowId}-node-1`,
        fromPort: "default",
        toNodeId: `${workflowId}-node-2`,
        toInput: "text"
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

export function createNodeDraft(
  type: WorkflowNodeType,
  position?: { x: number; y: number }
): WorkflowNode {
  const definition = WORKFLOW_NODE_LIBRARY_BY_TYPE[type];
  return {
    id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    title: definition.label,
    description: definition.description,
    status: definition.status,
    config: defaultConfigForNode(type),
    ...(position ? { position } : {})
  };
}

export function createEdgeDraft(
  workflow: WorkflowRecord,
  fromNodeId: string,
  toNodeId: string
): WorkflowEdge {
  const fromNodeType =
    workflow.nodes.find((node) => node.id === fromNodeId)?.type ?? "query-input";
  const toNodeType =
    workflow.nodes.find((node) => node.id === toNodeId)?.type ?? "return-text";
  const fromDefinition = WORKFLOW_NODE_LIBRARY_BY_TYPE[fromNodeType];
  const toDefinition = WORKFLOW_NODE_LIBRARY_BY_TYPE[toNodeType];

  return {
    id: `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    fromNodeId,
    fromPort: fromDefinition.outputs[0]?.name ?? "default",
    toNodeId,
    toInput: toDefinition.inputs[0]?.name ?? "input"
  };
}

export function sortWorkflowNodes(workflow: WorkflowRecord): WorkflowNode[] {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of workflow.edges) {
    if (!indegree.has(edge.toNodeId) || !indegree.has(edge.fromNodeId)) {
      continue;
    }
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
    outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge.toNodeId]);
  }

  const queue = workflow.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const ordered: WorkflowNode[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = nodeById.get(current);
    if (!node) {
      continue;
    }
    ordered.push(node);

    for (const next of outgoing.get(current) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
      }
    }
  }

  return ordered.length === workflow.nodes.length ? ordered : workflow.nodes;
}

export function defaultConfigForNode(type: WorkflowNodeType): Record<string, unknown> {
  switch (type) {
    case "query-input":
    case "clipboard-input":
    case "return-action-result":
    case "file-input":
    case "return-files":
      return {};
    case "static-value":
      return { value: "", valueType: "text" };
    case "http-request":
      return {
        method: "GET",
        urlTemplate: "https://example.com?q={{args.query | urlencode}}",
        headersTemplate: "{\n  \"Accept\": \"application/json\"\n}",
        queryParamsTemplate: "",
        jsonBodyTemplate: "",
        timeoutMs: 5000
      };
    case "invoke-workflow":
      return {
        workflowId: "",
        inputTemplates: {
          query: "{{input}}"
        }
      };
    case "template":
      return { template: "{{args.query}}", outputType: "text" };
    case "regex-replace":
      return { pattern: "\\s+", replacement: " ", flags: "g" };
    case "conditional-branch":
      return { operator: "contains", compareValue: "" };
    case "json-parse":
      return {};
    case "json-extract":
      return { path: "", outputType: "text", fallback: "" };
    case "open-url":
      return { urlTemplate: "https://example.com?q={{args.query | urlencode}}" };
    case "copy-to-clipboard":
      return { textTemplate: "{{input}}" };
    case "open-file":
      return { pathTemplate: "{{input}}" };
    case "run-shell-command":
      return { commandTemplate: "echo {{args.query}}" };
    case "invoke-shared-action":
      return {
        actionKind: "copy-text",
        title: "Workflow shared action",
        payloadTemplates: { text: "{{input}}" }
      };
    case "invoke-plugin-command":
      return {
        command: "gh",
        argumentTemplate: "{{input}}"
      };
    case "show-launcher-results":
      return {
        mode: "query",
        queryTemplate: "{{args.query}}",
        maxItems: 8,
        resultType: "url",
        resultSource: "workflows",
        titleTemplate: "{{item}}",
        subtitleTemplate: "",
        iconTemplate: "",
        itemsPath: "",
        actionKind: "open-url",
        actionTitle: "Open result",
        actionPayloadTemplate: "{\n  \"url\": \"{{item}}\"\n}",
        payloadTemplate: "{\n  \"value\": \"{{item}}\"\n}"
      };
    case "return-text":
      return { template: "{{input}}" };
    case "emit-toast":
      return { textTemplate: "{{input}}" };
  }
}
