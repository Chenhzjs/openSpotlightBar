import { describe, expect, it } from "vitest";

import { WORKFLOW_TEMPLATES } from "./workflow-templates";

describe("workflow templates", () => {
  it("has at least 4 templates", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  it("each template creates a workflow with unique IDs", () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      const wf1 = tpl.create();
      const wf2 = tpl.create();
      expect(wf1.id).not.toBe(wf2.id);
      expect(wf1.nodes.length).toBe(tpl.nodeCount);
      expect(wf1.builtIn).toBe(false);
      expect(wf1.createdAt).toBeGreaterThan(0);
      // Node IDs should be unique across instances
      const ids1 = new Set(wf1.nodes.map((n) => n.id));
      const ids2 = new Set(wf2.nodes.map((n) => n.id));
      for (const id of ids1) {
        expect(ids2.has(id)).toBe(false);
      }
    }
  });

  it("each template has valid edges referencing existing nodes", () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      const wf = tpl.create();
      const nodeIds = new Set(wf.nodes.map((n) => n.id));
      for (const edge of wf.edges) {
        expect(nodeIds.has(edge.fromNodeId)).toBe(true);
        expect(nodeIds.has(edge.toNodeId)).toBe(true);
      }
    }
  });

  it("each template has unique edge IDs", () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      const wf = tpl.create();
      const edgeIds = wf.edges.map((e) => e.id);
      expect(new Set(edgeIds).size).toBe(edgeIds.length);
    }
  });
});
