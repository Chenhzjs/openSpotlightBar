import type { WorkflowRecord } from "@osb/shared-types";

import { sortWorkflowNodes } from "../../features/workflows/editor";
import { LAYER_GAP_X, LAYER_GAP_Y, NODE_WIDTH } from "./canvas-constants";

/**
 * Compute a left-to-right DAG layout for nodes that lack a position.
 * Uses the existing topological sort, then assigns layers by longest-path.
 */
export function autoLayout(
  workflow: WorkflowRecord
): Map<string, { x: number; y: number }> {
  const sorted = sortWorkflowNodes(workflow);
  const positions = new Map<string, { x: number; y: number }>();

  if (sorted.length === 0) return positions;

  // Build adjacency from edges
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge.toNodeId]);
    incoming.set(edge.toNodeId, [...(incoming.get(edge.toNodeId) ?? []), edge.fromNodeId]);
  }

  // Longest-path layering
  const layer = new Map<string, number>();
  for (const node of sorted) {
    const parents = incoming.get(node.id) ?? [];
    const maxParentLayer = parents.reduce(
      (max, pid) => Math.max(max, (layer.get(pid) ?? 0) + 1),
      0
    );
    layer.set(node.id, maxParentLayer);
  }

  // Group by layer
  const layers = new Map<number, string[]>();
  for (const node of sorted) {
    const l = layer.get(node.id) ?? 0;
    layers.set(l, [...(layers.get(l) ?? []), node.id]);
  }

  // Assign positions: left-to-right, vertically centered per layer
  const maxLayer = Math.max(...layers.keys(), 0);
  for (let l = 0; l <= maxLayer; l++) {
    const ids = layers.get(l) ?? [];
    const totalHeight = ids.length * LAYER_GAP_Y;
    const startY = -totalHeight / 2 + LAYER_GAP_Y / 2;

    ids.forEach((id, index) => {
      // Offset conditional-branch true/false children slightly
      let yOffset = 0;
      const parents = incoming.get(id) ?? [];
      for (const pid of parents) {
        const edge = workflow.edges.find(
          (e) => e.fromNodeId === pid && e.toNodeId === id
        );
        if (edge?.fromPort === "true") yOffset = -30;
        if (edge?.fromPort === "false") yOffset = 30;
      }

      positions.set(id, {
        x: l * (NODE_WIDTH + LAYER_GAP_X),
        y: startY + index * LAYER_GAP_Y + yOffset
      });
    });
  }

  return positions;
}
