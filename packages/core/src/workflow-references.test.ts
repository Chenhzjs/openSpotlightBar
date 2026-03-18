import { describe, expect, it } from "vitest";

import { renderWorkflowTemplate, resolveWorkflowTemplateValue } from "./workflow-references";

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
          title: "Pulse Launcher"
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
      "Pulse Launcher #2"
    );
  });
});
