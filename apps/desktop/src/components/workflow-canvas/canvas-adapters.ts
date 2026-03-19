import { WORKFLOW_NODE_LIBRARY_BY_TYPE, extractImplicitNodeDependencies, extractWorkflowTemplateReferences } from "@osb/core";
import type { WorkflowNodeCategory } from "@osb/core";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowRecord
} from "@osb/shared-types";
import type { Edge, Node } from "@xyflow/react";

import { autoLayout } from "./canvas-layout";
import { CATEGORY_COLORS, NODE_WIDTH } from "./canvas-constants";

export interface CanvasNodeData {
  label: string;
  description?: string;
  category: WorkflowNodeCategory;
  nodeType: WorkflowNode["type"];
  status: WorkflowNode["status"];
  colors: (typeof CATEGORY_COLORS)[WorkflowNodeCategory];
  inputs: { name: string; valueType: string }[];
  outputs: { name: string; valueType: string }[];
  inputSources: { label: string; implicit: boolean }[];
  subflowName?: string;
  /** Inline debug value for input-type nodes (query-input, clipboard-input, static-value) */
  debugValue?: string;
  /** Preview-only value for static-value nodes */
  staticValue?: string;
  /** Callback to update a node's config from the canvas */
  onDebugValueChange?: (nodeId: string, value: string) => void;
  [key: string]: unknown;
}

export type CanvasNode = Node<CanvasNodeData, "workflowNode">;
export type CanvasEdge = Edge<{ fromPort: string; implicit?: boolean }, "workflowEdge">;

/* ── WorkflowRecord → ReactFlow elements ── */

export function toReactFlowElements(
  workflow: WorkflowRecord,
  allWorkflows?: WorkflowRecord[],
  onDebugValueChange?: (nodeId: string, value: string) => void
): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
} {
  const layoutPositions = autoLayout(workflow);
  const nodeById = new Map(workflow.nodes.map((n) => [n.id, n]));

  // Pre-compute explicit incoming edges per node
  const incomingByNode = new Map<string, { sourceTitle: string; port: string }[]>();
  for (const edge of workflow.edges) {
    const sourceNode = nodeById.get(edge.fromNodeId);
    if (!sourceNode) continue;
    const list = incomingByNode.get(edge.toNodeId) ?? [];
    list.push({ sourceTitle: sourceNode.title, port: edge.fromPort });
    incomingByNode.set(edge.toNodeId, list);
  }

  // Extract implicit dependencies
  const implicitDeps = extractImplicitNodeDependencies(workflow);
  const implicitByNode = new Map<string, { fromNodeId: string; fromPort: string; expression: string }[]>();
  for (const dep of implicitDeps) {
    const list = implicitByNode.get(dep.toNodeId) ?? [];
    list.push(dep);
    implicitByNode.set(dep.toNodeId, list);
  }

  // Compute input sources and subflow names per node
  function computeInputSources(node: WorkflowNode): { label: string; implicit: boolean }[] {
    const sources: { label: string; implicit: boolean }[] = [];
    // Explicit edges
    for (const inc of incomingByNode.get(node.id) ?? []) {
      sources.push({ label: `← ${inc.sourceTitle}.${inc.port}`, implicit: false });
    }
    // Implicit node refs
    for (const dep of implicitByNode.get(node.id) ?? []) {
      sources.push({ label: `← ${dep.fromNodeId}.${dep.fromPort} (ref)`, implicit: true });
    }
    // args.* / context.* refs from config
    if (node.config) {
      const configStrings = collectStrings(node.config);
      for (const str of configStrings) {
        for (const ref of extractWorkflowTemplateReferences(str)) {
          if (ref.path[0] === "args" && ref.path[1]) {
            const label = `← args.${ref.path[1]}`;
            if (!sources.some((s) => s.label === label)) {
              sources.push({ label, implicit: true });
            }
          } else if (ref.path[0] === "context" && ref.path[1]) {
            const label = `← context.${ref.path[1]}`;
            if (!sources.some((s) => s.label === label)) {
              sources.push({ label, implicit: true });
            }
          }
        }
      }
    }
    return sources;
  }

  function resolveSubflowName(node: WorkflowNode): string | undefined {
    if (node.type !== "invoke-workflow") return undefined;
    const workflowId = node.config?.workflowId as string | undefined;
    if (!workflowId || !allWorkflows) return undefined;
    return allWorkflows.find((w) => w.id === workflowId)?.name;
  }

  const nodes: CanvasNode[] = workflow.nodes.map((node) => {
    const def = WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type];
    const pos = node.position ?? layoutPositions.get(node.id) ?? { x: 0, y: 0 };

    return {
      id: node.id,
      type: "workflowNode",
      position: pos,
      width: NODE_WIDTH,
      data: {
        label: node.title,
        description: node.description,
        category: def.category,
        nodeType: node.type,
        status: node.status,
        colors: CATEGORY_COLORS[def.category],
        inputs: def.inputs.map((p) => ({ name: p.name, valueType: p.valueType })),
        outputs: def.outputs.map((p) => ({ name: p.name, valueType: p.valueType })),
        inputSources: computeInputSources(node),
        subflowName: resolveSubflowName(node),
        debugValue: (node.config?.debugValue as string | undefined) ?? undefined,
        staticValue: node.type === "static-value" ? (node.config?.value as string | undefined) ?? undefined : undefined,
        onDebugValueChange
      }
    };
  });

  const edges: CanvasEdge[] = workflow.edges.map((edge) => ({
    id: edge.id,
    type: "workflowEdge",
    source: edge.fromNodeId,
    sourceHandle: edge.fromPort,
    target: edge.toNodeId,
    targetHandle: edge.toInput,
    data: { fromPort: edge.fromPort, implicit: false }
  }));

  // Append implicit edges
  for (const dep of implicitDeps) {
    edges.push({
      id: `implicit-${dep.fromNodeId}-${dep.fromPort}-${dep.toNodeId}`,
      type: "workflowEdge",
      source: dep.fromNodeId,
      sourceHandle: dep.fromPort,
      target: dep.toNodeId,
      targetHandle: null,
      data: { fromPort: dep.fromPort, implicit: true }
    });
  }

  return { nodes, edges };
}

function collectStrings(obj: unknown): string[] {
  const result: string[] = [];
  function walk(v: unknown) {
    if (typeof v === "string") result.push(v);
    else if (Array.isArray(v)) for (const item of v) walk(item);
    else if (v && typeof v === "object") for (const val of Object.values(v)) walk(val);
  }
  walk(obj);
  return result;
}

/* ── ReactFlow position changes → WorkflowNode position updates ── */

export function applyNodePositions(
  workflow: WorkflowRecord,
  movedNodes: { id: string; position: { x: number; y: number } }[]
): WorkflowNode[] {
  const posMap = new Map(movedNodes.map((n) => [n.id, n.position]));
  return workflow.nodes.map((node) => {
    const pos = posMap.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });
}

/* ── ReactFlow new connection → WorkflowEdge ── */

export function connectionToEdge(connection: {
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
}): WorkflowEdge {
  return {
    id: `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    fromNodeId: connection.source,
    fromPort: connection.sourceHandle ?? "default",
    toNodeId: connection.target,
    toInput: connection.targetHandle ?? "input"
  };
}
