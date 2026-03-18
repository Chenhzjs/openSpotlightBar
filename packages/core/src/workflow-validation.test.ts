import { describe, expect, it } from "vitest";

import type { WorkflowRecord } from "@pulse/shared-types";

import { getBuiltInWorkflows } from "./workflow-examples";
import { validateWorkflow } from "./workflow-validation";

describe("validateWorkflow", () => {
  it("accepts built-in workflow examples", () => {
    const workflows = getBuiltInWorkflows();
    for (const workflow of workflows) {
      const issues = validateWorkflow(workflow, { workflowCatalog: workflows });
      expect(issues.filter((issue) => issue.level === "error")).toHaveLength(0);
    }
  });

  it("flags cycles and planned nodes as runtime errors", () => {
    const workflow: WorkflowRecord = {
      id: "invalid-cycle",
      name: "Invalid",
      description: "",
      enabled: true,
      builtIn: false,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/broken",
        enabled: true,
        command: "/broken",
        argumentName: "query"
      },
      nodes: [
        {
          id: "a",
          type: "file-input",
          title: "File Input",
          status: "planned",
          config: {}
        },
        {
          id: "b",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: {}
        }
      ],
      edges: [
        {
          id: "a:default->b:text",
          fromNodeId: "a",
          fromPort: "default",
          toNodeId: "b",
          toInput: "text"
        },
        {
          id: "b:default->a:input",
          fromNodeId: "b",
          fromPort: "default",
          toNodeId: "a",
          toInput: "input"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const issues = validateWorkflow(workflow);

    expect(issues.some((issue) => issue.message.includes("planned only"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("contains a cycle"))).toBe(true);
  });

  it("flags invalid references and incompatible edge types", () => {
    const workflow: WorkflowRecord = {
      id: "invalid-types-and-refs",
      name: "Broken Workflow",
      description: "",
      enabled: true,
      builtIn: false,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/broken",
        enabled: true,
        command: "/broken",
        argumentName: "query"
      },
      nodes: [
        {
          id: "query",
          type: "query-input",
          title: "Query",
          status: "supported",
          config: {}
        },
        {
          id: "template",
          type: "template",
          title: "Template",
          status: "supported",
          config: {
            template: "Hello {{nodes.missing.default}}"
          }
        },
        {
          id: "return-action",
          type: "return-action-result",
          title: "Return Action",
          status: "supported",
          config: {}
        }
      ],
      edges: [
        {
          id: "query:default->template:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "template",
          toInput: "input"
        },
        {
          id: "template:default->return-action:result",
          fromNodeId: "template",
          fromPort: "default",
          toNodeId: "return-action",
          toInput: "result"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const issues = validateWorkflow(workflow);

    expect(
      issues.some((issue) => issue.message.includes("invalid reference"))
    ).toBe(true);
    expect(
      issues.some((issue) => issue.message.includes("expects action-result"))
    ).toBe(true);
  });

  it("validates launcher-result item mode and HTTP request config requirements", () => {
    const workflow: WorkflowRecord = {
      id: "invalid-http-results",
      name: "Invalid HTTP Results",
      description: "",
      enabled: true,
      builtIn: false,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/broken-http",
        enabled: true,
        command: "/broken-http",
        argumentName: "query"
      },
      nodes: [
        {
          id: "request",
          type: "http-request",
          title: "Request",
          status: "supported",
          config: {
            method: "PUT",
            timeoutMs: "abc"
          }
        },
        {
          id: "results",
          type: "show-launcher-results",
          title: "Results",
          status: "supported",
          config: {
            mode: "items",
            titleTemplate: ""
          }
        }
      ],
      edges: [],
      createdAt: 1,
      updatedAt: 1
    };

    const issues = validateWorkflow(workflow);

    expect(issues.some((issue) => issue.message.includes("only supports GET and POST"))).toBe(
      true
    );
    expect(issues.some((issue) => issue.message.includes("requires a URL template"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("incoming 'items' edge"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("title template"))).toBe(true);
  });

  it("flags reusable workflow composition errors such as missing targets, non-reusable targets, and dependency cycles", () => {
    const reusableChild: WorkflowRecord = {
      id: "reusable-child",
      name: "Reusable Child",
      description: "",
      enabled: true,
      builtIn: false,
      reusable: {
        description: "",
        inputs: [{ name: "query", valueType: "text", required: true }],
        outputs: [{ name: "result", valueType: "text", valueTemplate: "{{nodes.echo.default}}" }]
      },
      tags: [],
      trigger: {
        type: "manual",
        label: "Reusable Child",
        enabled: true
      },
      nodes: [
        {
          id: "echo",
          type: "template",
          title: "Echo",
          status: "supported",
          config: { template: "{{args.query}}", outputType: "text" }
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
          id: "echo:default->return:text",
          fromNodeId: "echo",
          fromPort: "default",
          toNodeId: "return",
          toInput: "text"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const nonReusableTarget: WorkflowRecord = {
      ...reusableChild,
      id: "non-reusable-target",
      name: "Non Reusable",
      reusable: null
    };

    const parent: WorkflowRecord = {
      id: "parent",
      name: "Parent",
      description: "",
      enabled: true,
      builtIn: false,
      reusable: null,
      tags: [],
      trigger: {
        type: "slash-command",
        label: "/parent",
        enabled: true,
        command: "/parent",
        argumentName: "query"
      },
      nodes: [
        { id: "query", type: "query-input", title: "Query", status: "supported", config: {} },
        {
          id: "invokeMissing",
          type: "invoke-workflow",
          title: "Missing",
          status: "supported",
          config: { workflowId: "missing", inputTemplates: { query: "{{input}}" } }
        },
        {
          id: "invokeNonReusable",
          type: "invoke-workflow",
          title: "Non Reusable",
          status: "supported",
          config: { workflowId: "non-reusable-target", inputTemplates: { query: "{{input}}" } }
        },
        {
          id: "invokeChild",
          type: "invoke-workflow",
          title: "Reusable",
          status: "supported",
          config: { workflowId: "reusable-child", inputTemplates: { query: "{{input}}" } }
        },
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: { template: "{{nodes.invokeChild.default.result}}" }
        }
      ],
      edges: [
        {
          id: "query:default->invokeMissing:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "invokeMissing",
          toInput: "input"
        },
        {
          id: "query:default->invokeNonReusable:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "invokeNonReusable",
          toInput: "input"
        },
        {
          id: "query:default->invokeChild:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "invokeChild",
          toInput: "input"
        },
        {
          id: "invokeChild:default->return:text",
          fromNodeId: "invokeChild",
          fromPort: "default",
          toNodeId: "return",
          toInput: "text"
        }
      ],
      createdAt: 1,
      updatedAt: 1
    };

    const cyclicChild: WorkflowRecord = {
      ...reusableChild,
      id: "cyclic-child",
      name: "Cyclic Child",
      nodes: [
        {
          id: "invokeParent",
          type: "invoke-workflow",
          title: "Invoke Parent",
          status: "supported",
          config: { workflowId: "cyclic-parent", inputTemplates: { query: "{{args.query}}" } }
        },
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: { template: "{{nodes.invokeParent.default.result}}" }
        }
      ],
      edges: [
        {
          id: "invokeParent:default->return:text",
          fromNodeId: "invokeParent",
          fromPort: "default",
          toNodeId: "return",
          toInput: "text"
        }
      ]
    };

    const cyclicParent: WorkflowRecord = {
      ...parent,
      id: "cyclic-parent",
      reusable: {
        description: "",
        inputs: [{ name: "query", valueType: "text", required: true }],
        outputs: [{ name: "result", valueType: "text", valueTemplate: "{{nodes.return.default}}" }]
      },
      nodes: [
        { id: "query", type: "query-input", title: "Query", status: "supported", config: {} },
        {
          id: "invokeChild",
          type: "invoke-workflow",
          title: "Invoke Child",
          status: "supported",
          config: { workflowId: "cyclic-child", inputTemplates: { query: "{{input}}" } }
        },
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: { template: "{{nodes.invokeChild.default.result}}" }
        }
      ],
      edges: [
        {
          id: "query:default->invokeChild:input",
          fromNodeId: "query",
          fromPort: "default",
          toNodeId: "invokeChild",
          toInput: "input"
        },
        {
          id: "invokeChild:default->return:text",
          fromNodeId: "invokeChild",
          fromPort: "default",
          toNodeId: "return",
          toInput: "text"
        }
      ]
    };

    const issues = validateWorkflow(parent, {
      workflowCatalog: [parent, reusableChild, nonReusableTarget]
    });
    const cycleIssues = validateWorkflow(cyclicParent, {
      workflowCatalog: [cyclicParent, cyclicChild]
    });

    expect(issues.some((issue) => issue.message.includes("missing workflow"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("not marked reusable"))).toBe(true);
    expect(cycleIssues.some((issue) => issue.message.includes("dependency cycle"))).toBe(true);
  });

  it("warns when a keyword trigger is shadowed by a higher-priority workflow", () => {
    const builtInKeyword: WorkflowRecord = {
      id: "built-in-keyword",
      name: "Built-in Keyword",
      description: "",
      enabled: true,
      builtIn: true,
      tags: ["keyword"],
      trigger: {
        type: "keyword",
        label: "gh",
        enabled: true,
        keyword: "gh",
        argumentName: "query"
      },
      nodes: [
        {
          id: "return",
          type: "return-text",
          title: "Return",
          status: "supported",
          config: { template: "{{args.query}}" }
        }
      ],
      edges: [],
      createdAt: 1,
      updatedAt: 1
    };

    const customKeyword: WorkflowRecord = {
      ...builtInKeyword,
      id: "custom-keyword",
      name: "Custom Keyword",
      builtIn: false,
      updatedAt: 2
    };

    const issues = validateWorkflow(builtInKeyword, {
      workflowCatalog: [builtInKeyword, customKeyword]
    });

    expect(issues.some((issue) => issue.message.includes("shadowed"))).toBe(true);
  });
});
