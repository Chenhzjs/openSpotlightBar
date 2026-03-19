import { describe, expect, it } from "vitest";

import type { WorkflowRecord } from "@osb/shared-types";

import {
  buildWorkflowRunContext,
  createWorkflowTriggerRegistry,
  getBuiltInWorkflows,
  matchWorkflowTriggerInvocation
} from ".";

describe("workflow trigger registry", () => {
  it("matches keyword workflows and extracts the remainder text as the primary argument", () => {
    const workflows = getBuiltInWorkflows();
    const registry = createWorkflowTriggerRegistry(workflows);
    const match = matchWorkflowTriggerInvocation("jira ENG-123", registry);

    expect(match?.workflow.id).toBe("builtin-jira-keyword");

    const context = buildWorkflowRunContext(match!.workflow, "jira ENG-123");

    expect(context.triggerType).toBe("keyword");
    expect(context.argsText).toBe("ENG-123");
    expect(context.argsByName.ticket).toBe("ENG-123");
  });

  it("supports keyword aliases in the active trigger registry", () => {
    const workflows = getBuiltInWorkflows();
    const registry = createWorkflowTriggerRegistry(workflows);

    const match = matchWorkflowTriggerInvocation("google pulse launcher", registry);

    expect(match?.workflow.id).toBe("builtin-google-keyword");
    expect(match?.registration.isAlias).toBe(true);
  });

  it("prefers custom workflows over built-ins when keyword triggers conflict", () => {
    const builtIn: WorkflowRecord = {
      id: "built-in",
      name: "Built-in Google",
      description: "",
      enabled: true,
      builtIn: true,
      tags: ["keyword"],
      trigger: {
        type: "keyword",
        label: "g",
        enabled: true,
        keyword: "g",
        argumentName: "query"
      },
      nodes: [],
      edges: [],
      createdAt: 1,
      updatedAt: 1
    };

    const custom: WorkflowRecord = {
      ...builtIn,
      id: "custom",
      name: "Custom Google",
      builtIn: false,
      updatedAt: 2
    };

    const registry = createWorkflowTriggerRegistry([builtIn, custom]);
    const match = matchWorkflowTriggerInvocation("g pulse", registry);
    const shadowed = registry.registrations.find((entry) => entry.workflowId === "built-in");

    expect(match?.workflow.id).toBe("custom");
    expect(shadowed?.state).toBe("shadowed");
    expect(shadowed?.shadowedByWorkflowId).toBe("custom");
  });
});
