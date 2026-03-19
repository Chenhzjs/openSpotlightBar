import { describe, expect, it } from "vitest";

import type { WorkflowHttpRequest, WorkflowRecord } from "@osb/shared-types";

import {
  buildWorkflowRunContext,
  getBuiltInWorkflows,
  runWorkflow,
  type WorkflowRuntimeServices
} from ".";

function createRuntimeServices(
  overrides: Partial<WorkflowRuntimeServices> = {}
): WorkflowRuntimeServices {
  return {
    async getClipboardText() {
      return "";
    },
    async performSharedAction() {
      return { ok: true, message: "Action executed." };
    },
    async runShellCommand() {
      return { ok: true, message: "Shell executed." };
    },
    async invokePluginCommand() {
      return { ok: true, message: "Plugin command executed." };
    },
    ...overrides
  };
}

describe("runWorkflow", () => {
  it("executes a linear slash-command workflow through the shared action layer", async () => {
    const builtIns = getBuiltInWorkflows();
    const workflow = builtIns.find((entry) => entry.id === "builtin-google-search")!;
    const sharedActions: string[] = [];

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, "/google pulse launcher"),
      createRuntimeServices({
        async performSharedAction(action) {
          sharedActions.push(`${action.kind}:${String(action.payload?.url ?? "")}`);
          return { ok: true, message: "Opened URL." };
        }
      }),
      { workflowCatalog: builtIns }
    );

    expect(result.ok).toBe(true);
    expect(sharedActions[0]).toContain(
      "open-url:https://www.google.com/search?q=pulse%20launcher"
    );
    expect(result.actionResponse?.ok).toBe(true);
    expect(result.logs).toHaveLength(5);
    expect(result.logs.find((entry) => entry.nodeId === "build")?.nestedLogs?.length).toBeGreaterThan(0);
  });

  it("supports explicit true/false branching without running both sides", async () => {
    const workflow: WorkflowRecord = {
      id: "branching",
      name: "Branching",
      description: "",
      enabled: true,
      builtIn: false,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/branch",
        enabled: true,
        command: "/branch",
        argumentName: "query"
      },
      nodes: [
        { id: "query", type: "query-input", title: "Query", status: "supported", config: {} },
        {
          id: "branch",
          type: "conditional-branch",
          title: "Branch",
          status: "supported",
          config: { operator: "contains", compareValue: "open" }
        },
        {
          id: "openText",
          type: "template",
          title: "Open Text",
          status: "supported",
          config: { template: "open branch" }
        },
        {
          id: "closedText",
          type: "template",
          title: "Closed Text",
          status: "supported",
          config: { template: "false branch" }
        },
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: {}
        }
      ],
      edges: [
        {
          id: "query:default->branch:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "branch",
          toInput: "input"
        },
        {
          id: "branch:true->openText:input",
          fromNodeId: "branch",
          fromPort: "true",
          toNodeId: "openText",
          toInput: "input"
        },
        {
          id: "branch:false->closedText:input",
          fromNodeId: "branch",
          fromPort: "false",
          toNodeId: "closedText",
          toInput: "input"
        },
        {
          id: "openText:default->return:text",
          fromNodeId: "openText",
          fromPort: "default",
          toNodeId: "return",
          toInput: "text"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, "/branch open this"),
      createRuntimeServices()
    );

    expect(result.ok).toBe(true);
    expect(result.returnedText).toBe("open branch");
    expect(result.logs.some((entry) => entry.nodeId === "closedText" && entry.status === "skipped")).toBe(true);
  });

  it("parses structured JSON and supports pretty rendering through template filters", async () => {
    const builtIns = getBuiltInWorkflows();
    const workflow = builtIns.find((entry) => entry.id === "builtin-json-pretty")!;

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, '/json-pretty {"hello":"world"}'),
      createRuntimeServices(),
      { workflowCatalog: builtIns }
    );

    expect(result.ok).toBe(true);
    expect(result.returnedText).toContain('"hello": "world"');
  });

  it("reports runtime JSON parse failures clearly", async () => {
    const builtIns = getBuiltInWorkflows();
    const workflow = builtIns.find((entry) => entry.id === "builtin-json-pretty")!;

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, "/json-pretty not-json"),
      createRuntimeServices(),
      { workflowCatalog: builtIns }
    );

    expect(result.ok).toBe(false);
    expect(result.failureStage).toBe("runtime");
    expect(result.error).toContain("could not parse JSON");
  });

  it("can return launcher results through the runtime service", async () => {
    const workflow: WorkflowRecord = {
      id: "show-results",
      name: "Show Results",
      description: "",
      enabled: true,
      builtIn: false,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/search",
        enabled: true,
        command: "/search",
        argumentName: "query"
      },
      nodes: [
        { id: "query", type: "query-input", title: "Query", status: "supported", config: {} },
        {
          id: "search",
          type: "show-launcher-results",
          title: "Search Launcher",
          status: "supported",
          config: {}
        }
      ],
      edges: [
        {
          id: "query:default->search:query",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "search",
          toInput: "query"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, "/search terminal"),
      createRuntimeServices({
        async searchLauncher(query) {
          return [
            {
              id: "mock:terminal",
              title: query,
              subtitle: "Mock result",
              type: "command",
              source: "system",
              score: 1,
              actions: [],
              payload: {}
            }
          ];
        }
      })
    );

    expect(result.ok).toBe(true);
    expect(result.resultItems).toHaveLength(1);
    expect(result.resultItems?.[0]?.title).toBe("terminal");
  });

  it("executes HTTP request nodes and maps structured items into launcher results", async () => {
    const builtIns = getBuiltInWorkflows();
    const workflow = builtIns.find((entry) => entry.id === "builtin-gh-search")!;
    const capturedRequests: WorkflowHttpRequest[] = [];

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, "/gh-search pulse launcher"),
      createRuntimeServices({
        async requestHttp(request) {
          capturedRequests.push(request);
          return {
            url: "https://api.github.com/search/repositories?q=pulse+launcher&per_page=5&sort=stars",
            status: 200,
            ok: true,
            headers: { "content-type": "application/json" },
            contentType: "application/json",
            text: JSON.stringify({
              items: [
                {
                  full_name: "openai/pulse-launcher",
                  description: "Launcher repo",
                  html_url: "https://github.com/openai/pulse-launcher",
                  stargazers_count: 42,
                  language: "TypeScript"
                }
              ]
            }),
            json: {
              items: [
                {
                  full_name: "openai/pulse-launcher",
                  description: "Launcher repo",
                  html_url: "https://github.com/openai/pulse-launcher",
                  stargazers_count: 42,
                  language: "TypeScript"
                }
              ]
            }
          };
        }
      }),
      { workflowCatalog: builtIns }
    );

    expect(result.ok).toBe(true);
    expect(capturedRequests[0]).toMatchObject({
      method: "GET",
      url: "https://api.github.com/search/repositories"
    });
    expect(capturedRequests[0]?.queryParams.q).toBe("pulse launcher");
    expect(result.resultItems?.[0]).toMatchObject({
      title: "openai/pulse-launcher",
      subtitle: "Launcher repo",
      source: "workflows",
      type: "url"
    });
    expect(result.resultItems?.[0]?.actions[0]?.kind).toBe("open-url");
  });

  it("fails clearly when an HTTP request node times out or the host rejects the request", async () => {
    const workflow: WorkflowRecord = {
      id: "http-failure",
      name: "HTTP Failure",
      description: "",
      enabled: true,
      builtIn: false,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/http",
        enabled: true,
        command: "/http",
        argumentName: "query"
      },
      nodes: [
        { id: "query", type: "query-input", title: "Query", status: "supported", config: {} },
        {
          id: "request",
          type: "http-request",
          title: "HTTP Request",
          status: "supported",
          config: {
            method: "GET",
            urlTemplate: "https://example.com?q={{args.query}}",
            timeoutMs: 200
          }
        },
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: {}
        }
      ],
      edges: [
        {
          id: "query:default->request:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "request",
          toInput: "input"
        },
        {
          id: "request:text->return:text",
          fromNodeId: "request",
          fromPort: "text",
          toNodeId: "return",
          toInput: "text"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, "/http demo"),
      createRuntimeServices({
        async requestHttp() {
          throw new Error("Request timed out after 200ms");
        }
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failureStage).toBe("runtime");
    expect(result.error).toContain("timed out");
    expect(result.logs[1]?.error ?? result.logs[0]?.error).toContain("timed out");
  });

  it("executes reusable subflows and exposes nested logs on the invoke node", async () => {
    const workflows = getBuiltInWorkflows();
    const workflow = workflows.find((entry) => entry.id === "builtin-google-search")!;

    const result = await runWorkflow(
      workflow,
      buildWorkflowRunContext(workflow, "/google pulse launcher"),
      createRuntimeServices({
        async performSharedAction(action) {
          return { ok: true, message: String(action.payload?.url ?? "") };
        }
      }),
      { workflowCatalog: workflows }
    );

    expect(result.ok).toBe(true);
    expect(result.logs.find((entry) => entry.nodeId === "build")?.nestedLogs?.length).toBeGreaterThan(0);
    expect(result.logs.find((entry) => entry.nodeId === "build")?.status).toBe("success");
  });

  it("fails reusable subflows clearly when an input cannot satisfy the reusable contract", async () => {
    const reusableWorkflow: WorkflowRecord = {
      id: "reusable-object",
      name: "Reusable Object",
      description: "",
      enabled: true,
      builtIn: false,
      reusable: {
        description: "",
        inputs: [{ name: "payload", valueType: "object", required: true }],
        outputs: [{ name: "result", valueType: "text", valueTemplate: "{{args.payload.name}}" }]
      },
      tags: [],
      trigger: {
        type: "manual",
        label: "Reusable Object",
        enabled: true
      },
      nodes: [
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: { template: "{{args.payload.name}}" }
        }
      ],
      edges: [],
      createdAt: 1,
      updatedAt: 1
    };

    const parentWorkflow: WorkflowRecord = {
      id: "invoke-object",
      name: "Invoke Object",
      description: "",
      enabled: true,
      builtIn: false,
      reusable: null,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/invoke",
        enabled: true,
        command: "/invoke",
        argumentName: "query"
      },
      nodes: [
        { id: "query", type: "query-input", title: "Query", status: "supported", config: {} },
        {
          id: "invoke",
          type: "invoke-workflow",
          title: "Invoke Workflow",
          status: "supported",
          config: {
            workflowId: "reusable-object",
            inputTemplates: {
              payload: "{{input}}"
            }
          }
        },
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: { template: "{{nodes.invoke.default.result}}" }
        }
      ],
      edges: [
        {
          id: "query:default->invoke:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "invoke",
          toInput: "input"
        },
        {
          id: "invoke:default->return:text",
          fromNodeId: "invoke",
          fromPort: "default",
          toNodeId: "return",
          toInput: "text"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const result = await runWorkflow(
      parentWorkflow,
      buildWorkflowRunContext(parentWorkflow, "/invoke plain-text"),
      createRuntimeServices(),
      { workflowCatalog: [parentWorkflow, reusableWorkflow] }
    );

    expect(result.ok).toBe(false);
    expect(result.failureStage).toBe("runtime");
    expect(result.error).toContain("could not parse JSON");
  });
});
