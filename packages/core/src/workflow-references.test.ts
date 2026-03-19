import { describe, expect, it } from "vitest";

import {
  renderWorkflowTemplate,
  resolveWorkflowTemplateValue,
  extractImplicitNodeDependencies
} from "./workflow-references";

describe("workflow references", () => {
  const environment = {
    context: {
      workflowId: "workflow-1",
      workflowName: "Reference Test",
      triggerType: "slash-command" as const,
      invokedAt: 1,
      query: "/test pulse launcher",
      rawInput: "/test pulse launcher",
      slashCommand: "/test",
      argsText: "pulse launcher",
      argsByName: {
        query: "pulse launcher"
      },
      launcherQuery: "/test pulse launcher",
      clipboardText: "clipboard value",
      files: []
    },
    inputs: {
      input: {
        type: "object" as const,
        value: {
          user: {
            name: "Ada"
          }
        }
      }
    },
    nodeOutputs: new Map([
      [
        "parse",
        {
          default: {
            type: "object" as const,
            value: {
              user: {
                name: "Lin"
              }
            }
          }
        }
      ]
    ]),
    extraValues: {
      item: {
        type: "object" as const,
        value: {
          title: "Open Spotlight Bar"
        }
      },
      index: {
        type: "number" as const,
        value: 2
      }
    }
  };

  it("renders explicit args, context, inputs, and node references", () => {
    expect(
      renderWorkflowTemplate(
        "Hello {{args.query | upper}} from {{inputs.input.user.name}} and {{nodes.parse.default.user.name}}",
        environment
      )
    ).toBe("Hello PULSE LAUNCHER from Ada and Lin");
  });

  it("returns raw values for single-reference templates", () => {
    expect(resolveWorkflowTemplateValue("{{nodes.parse.default}}", environment)).toEqual({
      user: {
        name: "Lin"
      }
    });
  });

  it("supports extra reference roots used by workflow result mapping", () => {
    expect(renderWorkflowTemplate("{{item.title}} #{{index}}", environment)).toBe(
      "Open Spotlight Bar #2"
    );
  });
});

describe("extractImplicitNodeDependencies", () => {
  it("extracts implicit node references from config templates", () => {
    const workflow = {
      nodes: [
        {
          id: "a",
          type: "query-input" as const,
          title: "A",
          status: "supported" as const,
          config: {}
        },
        {
          id: "b",
          type: "template" as const,
          title: "B",
          status: "supported" as const,
          config: { template: "{{nodes.a.default}}" }
        }
      ],
      edges: []
    };
    const deps = extractImplicitNodeDependencies(workflow);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      fromNodeId: "a",
      fromPort: "default",
      toNodeId: "b",
      expression: "nodes.a.default"
    });
  });

  it("excludes dependencies already covered by explicit edges", () => {
    const workflow = {
      nodes: [
        {
          id: "a",
          type: "query-input" as const,
          title: "A",
          status: "supported" as const,
          config: {}
        },
        {
          id: "b",
          type: "template" as const,
          title: "B",
          status: "supported" as const,
          config: { template: "{{nodes.a.default}}" }
        }
      ],
      edges: [
        {
          id: "e1",
          fromNodeId: "a",
          fromPort: "default",
          toNodeId: "b",
          toInput: "input"
        }
      ]
    };
    const deps = extractImplicitNodeDependencies(workflow);
    expect(deps).toHaveLength(0);
  });

  it("excludes references to non-existent nodes", () => {
    const workflow = {
      nodes: [
        {
          id: "b",
          type: "template" as const,
          title: "B",
          status: "supported" as const,
          config: { template: "{{nodes.missing.default}}" }
        }
      ],
      edges: []
    };
    const deps = extractImplicitNodeDependencies(workflow);
    expect(deps).toHaveLength(0);
  });

  it("deduplicates identical references in the same node", () => {
    const workflow = {
      nodes: [
        {
          id: "a",
          type: "query-input" as const,
          title: "A",
          status: "supported" as const,
          config: {}
        },
        {
          id: "b",
          type: "template" as const,
          title: "B",
          status: "supported" as const,
          config: { template: "{{nodes.a.default}} and {{nodes.a.default}}" }
        }
      ],
      edges: []
    };
    const deps = extractImplicitNodeDependencies(workflow);
    expect(deps).toHaveLength(1);
  });
});
