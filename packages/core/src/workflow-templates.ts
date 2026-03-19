import type { WorkflowRecord } from "@osb/shared-types";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "web-search" | "api-integration" | "text-processing" | "launcher-results";
  tags: string[];
  triggerType: string;
  nodeCount: number;
  create(): WorkflowRecord;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeNode(
  id: string,
  type: WorkflowRecord["nodes"][number]["type"],
  title: string,
  config: Record<string, unknown> = {},
  position?: { x: number; y: number }
): WorkflowRecord["nodes"][number] {
  return {
    id,
    type,
    title,
    status: "supported",
    config,
    ...(position ? { position } : {})
  };
}

function makeEdge(
  id: string,
  fromNodeId: string,
  fromPort: string,
  toNodeId: string,
  toInput: string
): WorkflowRecord["edges"][number] {
  return { id, fromNodeId, fromPort, toNodeId, toInput };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "template-web-search",
    name: "Web Search",
    description: "Build a search URL from user query and open it in the browser.",
    category: "web-search",
    tags: ["url", "browser", "slash-command"],
    triggerType: "slash-command",
    nodeCount: 3,
    create(): WorkflowRecord {
      const wid = `wf-${uid()}`;
      const n1 = `${wid}-n1`,
        n2 = `${wid}-n2`,
        n3 = `${wid}-n3`;
      const now = Date.now();
      return {
        id: wid,
        name: "Web Search",
        description: "Open a search URL from query input.",
        enabled: true,
        builtIn: false,
        reusable: null,
        tags: ["custom", "web-search"],
        trigger: {
          type: "slash-command",
          label: "/search",
          enabled: true,
          command: "/search",
          argumentName: "query",
          placeholder: "Search query"
        },
        nodes: [
          makeNode(n1, "query-input", "Query Input", {}, { x: 0, y: 0 }),
          makeNode(
            n2,
            "template",
            "Build URL",
            {
              template: "https://www.google.com/search?q={{args.query | urlencode}}",
              outputType: "url"
            },
            { x: 300, y: 0 }
          ),
          makeNode(n3, "open-url", "Open URL", {}, { x: 600, y: 0 })
        ],
        edges: [
          makeEdge(`${wid}-e1`, n1, "default", n2, "input"),
          makeEdge(`${wid}-e2`, n2, "default", n3, "url")
        ],
        createdAt: now,
        updatedAt: now
      };
    }
  },
  {
    id: "template-api-json",
    name: "API + JSON Extract",
    description: "Fetch a JSON API, extract a field, and return the result as text.",
    category: "api-integration",
    tags: ["http", "json", "slash-command"],
    triggerType: "slash-command",
    nodeCount: 4,
    create(): WorkflowRecord {
      const wid = `wf-${uid()}`;
      const n1 = `${wid}-n1`,
        n2 = `${wid}-n2`,
        n3 = `${wid}-n3`,
        n4 = `${wid}-n4`;
      const now = Date.now();
      return {
        id: wid,
        name: "API + JSON Extract",
        description: "Fetch JSON from an API and extract a value.",
        enabled: true,
        builtIn: false,
        reusable: null,
        tags: ["custom", "api"],
        trigger: {
          type: "slash-command",
          label: "/api",
          enabled: true,
          command: "/api",
          argumentName: "query",
          placeholder: "API query"
        },
        nodes: [
          makeNode(n1, "query-input", "Query Input", {}, { x: 0, y: 0 }),
          makeNode(
            n2,
            "http-request",
            "HTTP Request",
            {
              method: "GET",
              urlTemplate: "https://api.example.com/data?q={{args.query | urlencode}}",
              headersTemplate: '{\n  "Accept": "application/json"\n}',
              timeoutMs: 5000
            },
            { x: 300, y: 0 }
          ),
          makeNode(
            n3,
            "json-extract",
            "Extract Field",
            { path: "json.result", outputType: "text", fallback: "" },
            { x: 600, y: 0 }
          ),
          makeNode(
            n4,
            "return-text",
            "Return Text",
            { template: "{{input}}" },
            { x: 900, y: 0 }
          )
        ],
        edges: [
          makeEdge(`${wid}-e1`, n1, "default", n2, "input"),
          makeEdge(`${wid}-e2`, n2, "default", n3, "input"),
          makeEdge(`${wid}-e3`, n3, "default", n4, "text")
        ],
        createdAt: now,
        updatedAt: now
      };
    }
  },
  {
    id: "template-clipboard-transform",
    name: "Clipboard Transform",
    description: "Read clipboard, apply a regex replacement, and copy the result back.",
    category: "text-processing",
    tags: ["clipboard", "regex", "slash-command"],
    triggerType: "slash-command",
    nodeCount: 4,
    create(): WorkflowRecord {
      const wid = `wf-${uid()}`;
      const n1 = `${wid}-n1`,
        n2 = `${wid}-n2`,
        n3 = `${wid}-n3`,
        n4 = `${wid}-n4`;
      const now = Date.now();
      return {
        id: wid,
        name: "Clipboard Transform",
        description: "Clean clipboard text with regex and copy it back.",
        enabled: true,
        builtIn: false,
        reusable: null,
        tags: ["custom", "clipboard"],
        trigger: {
          type: "slash-command",
          label: "/clip-transform",
          enabled: true,
          command: "/clip-transform",
          argumentName: "query",
          placeholder: "Uses clipboard"
        },
        nodes: [
          makeNode(n1, "clipboard-input", "Clipboard Input", {}, { x: 0, y: 0 }),
          makeNode(
            n2,
            "regex-replace",
            "Regex Replace",
            { pattern: "\\s+", replacement: " ", flags: "g" },
            { x: 300, y: 0 }
          ),
          makeNode(
            n3,
            "copy-to-clipboard",
            "Copy Result",
            { textTemplate: "{{input}}" },
            { x: 600, y: 0 }
          ),
          makeNode(n4, "return-action-result", "Return Result", {}, { x: 900, y: 0 })
        ],
        edges: [
          makeEdge(`${wid}-e1`, n1, "default", n2, "input"),
          makeEdge(`${wid}-e2`, n2, "default", n3, "text"),
          makeEdge(`${wid}-e3`, n3, "default", n4, "result")
        ],
        createdAt: now,
        updatedAt: now
      };
    }
  },
  {
    id: "template-launcher-results",
    name: "Launcher Results",
    description: "Fetch items from an API and display them as native launcher results.",
    category: "launcher-results",
    tags: ["http", "launcher", "slash-command"],
    triggerType: "slash-command",
    nodeCount: 3,
    create(): WorkflowRecord {
      const wid = `wf-${uid()}`;
      const n1 = `${wid}-n1`,
        n2 = `${wid}-n2`,
        n3 = `${wid}-n3`;
      const now = Date.now();
      return {
        id: wid,
        name: "Launcher Results",
        description: "Fetch items and show them as launcher results.",
        enabled: true,
        builtIn: false,
        reusable: null,
        tags: ["custom", "launcher-results"],
        trigger: {
          type: "slash-command",
          label: "/results",
          enabled: true,
          command: "/results",
          argumentName: "query",
          placeholder: "Search query"
        },
        nodes: [
          makeNode(n1, "query-input", "Query Input", {}, { x: 0, y: 0 }),
          makeNode(
            n2,
            "http-request",
            "HTTP Request",
            {
              method: "GET",
              urlTemplate: "https://api.example.com/search?q={{args.query | urlencode}}",
              headersTemplate: '{\n  "Accept": "application/json"\n}',
              timeoutMs: 5000
            },
            { x: 300, y: 0 }
          ),
          makeNode(
            n3,
            "show-launcher-results",
            "Show Results",
            {
              mode: "items",
              itemsPath: "json.items",
              titleTemplate: "{{item.title}}",
              subtitleTemplate: "{{item.description}}",
              iconTemplate: "",
              resultType: "url",
              resultSource: "workflows",
              maxItems: 8,
              actionKind: "open-url",
              actionTitle: "Open",
              actionPayloadTemplate: '{\n  "url": "{{item.url}}"\n}',
              payloadTemplate: '{\n  "value": "{{item.url}}"\n}'
            },
            { x: 600, y: 0 }
          )
        ],
        edges: [
          makeEdge(`${wid}-e1`, n1, "default", n2, "input"),
          makeEdge(`${wid}-e2`, n2, "default", n3, "items")
        ],
        createdAt: now,
        updatedAt: now
      };
    }
  }
];
