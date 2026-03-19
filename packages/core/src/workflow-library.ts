import type {
  WorkflowNodeStatus,
  WorkflowNodeType,
  WorkflowValueType
} from "@osb/shared-types";

export type WorkflowNodeCategory = "input" | "transform" | "action" | "output";

export interface WorkflowPortDefinition {
  name: string;
  valueType: WorkflowValueType;
  acceptedValueTypes?: WorkflowValueType[];
  required?: boolean;
  description?: string;
}

export interface WorkflowNodeDefinition {
  type: WorkflowNodeType;
  label: string;
  category: WorkflowNodeCategory;
  status: WorkflowNodeStatus;
  description: string;
  inputs: WorkflowPortDefinition[];
  outputs: WorkflowPortDefinition[];
}

export const WORKFLOW_NODE_LIBRARY: WorkflowNodeDefinition[] = [
  {
    type: "query-input",
    label: "Query Input",
    category: "input",
    status: "supported",
    description: "Reads the slash-command argument text from the launcher context.",
    inputs: [],
    outputs: [{ name: "default", valueType: "text" }]
  },
  {
    type: "clipboard-input",
    label: "Clipboard Input",
    category: "input",
    status: "supported",
    description: "Reads the latest text clipboard value.",
    inputs: [],
    outputs: [{ name: "default", valueType: "text" }]
  },
  {
    type: "file-input",
    label: "File Input",
    category: "input",
    status: "planned",
    description: "Planned scaffold for file or path capture from the launcher context.",
    inputs: [],
    outputs: [{ name: "default", valueType: "file" }]
  },
  {
    type: "static-value",
    label: "Static Value",
    category: "input",
    status: "supported",
    description: "Emits a fixed text, URL, object, or file path configured in the node.",
    inputs: [],
    outputs: [{ name: "default", valueType: "text" }]
  },
  {
    type: "http-request",
    label: "HTTP Request",
    category: "action",
    status: "supported",
    description:
      "Performs a scoped GET or POST request through the workflow host and exposes typed response ports.",
    inputs: [
      {
        name: "input",
        valueType: "text",
        acceptedValueTypes: [
          "text",
          "url",
          "object",
          "number",
          "boolean",
          "http-response"
        ]
      }
    ],
    outputs: [
      { name: "default", valueType: "http-response" },
      { name: "status", valueType: "number" },
      { name: "ok", valueType: "boolean" },
      { name: "text", valueType: "text" },
      { name: "json", valueType: "object" },
      { name: "headers", valueType: "object" }
    ]
  },
  {
    type: "invoke-workflow",
    label: "Invoke Workflow",
    category: "action",
    status: "supported",
    description:
      "Calls another reusable workflow through the shared runtime and returns its declared outputs as a structured object.",
    inputs: [
      {
        name: "input",
        valueType: "object",
        acceptedValueTypes: [
          "text",
          "url",
          "number",
          "boolean",
          "object",
          "http-response",
          "result-list",
          "action-result"
        ]
      }
    ],
    outputs: [{ name: "default", valueType: "object" }]
  },
  {
    type: "template",
    label: "Template",
    category: "transform",
    status: "supported",
    description:
      "Interpolates text using workflow references, filters, upstream inputs, and launcher context values.",
    inputs: [
      {
        name: "input",
        valueType: "text",
        acceptedValueTypes: [
          "text",
          "url",
          "number",
          "object",
          "http-response",
          "action-result",
          "boolean"
        ]
      }
    ],
    outputs: [{ name: "default", valueType: "text" }]
  },
  {
    type: "regex-replace",
    label: "Regex Replace",
    category: "transform",
    status: "supported",
    description: "Applies a regex replacement to incoming text.",
    inputs: [{ name: "input", valueType: "text", required: true }],
    outputs: [{ name: "default", valueType: "text" }]
  },
  {
    type: "conditional-branch",
    label: "Conditional Branch",
    category: "transform",
    status: "supported",
    description:
      "Routes execution through the true or false branch using a simple condition.",
    inputs: [
      {
        name: "input",
        valueType: "text",
        acceptedValueTypes: [
          "text",
          "url",
          "number",
          "object",
          "http-response",
          "boolean"
        ],
        required: true
      }
    ],
    outputs: [
      { name: "true", valueType: "text" },
      { name: "false", valueType: "text" }
    ]
  },
  {
    type: "json-parse",
    label: "JSON Parse",
    category: "transform",
    status: "supported",
    description:
      "Parses incoming text into a structured object for downstream extraction or templating.",
    inputs: [{ name: "input", valueType: "text", required: true }],
    outputs: [{ name: "default", valueType: "object" }]
  },
  {
    type: "json-extract",
    label: "JSON Extract",
    category: "transform",
    status: "supported",
    description:
      "Extracts a nested value from a structured object or parseable JSON text using a simple path.",
    inputs: [
      {
        name: "input",
        valueType: "object",
        acceptedValueTypes: ["object", "http-response", "text"],
        required: true
      }
    ],
    outputs: [{ name: "default", valueType: "object" }]
  },
  {
    type: "open-url",
    label: "Open URL",
    category: "action",
    status: "supported",
    description: "Opens a URL through the shared action layer.",
    inputs: [{ name: "url", valueType: "url", required: true }],
    outputs: [{ name: "default", valueType: "action-result" }]
  },
  {
    type: "copy-to-clipboard",
    label: "Copy to Clipboard",
    category: "action",
    status: "supported",
    description: "Copies text to the clipboard through the shared action layer.",
    inputs: [{ name: "text", valueType: "text", required: true }],
    outputs: [{ name: "default", valueType: "action-result" }]
  },
  {
    type: "open-file",
    label: "Open File",
    category: "action",
    status: "supported",
    description: "Opens a file or folder path through the shared action layer.",
    inputs: [{ name: "path", valueType: "file", required: true }],
    outputs: [{ name: "default", valueType: "action-result" }]
  },
  {
    type: "run-shell-command",
    label: "Run Shell Command",
    category: "action",
    status: "supported",
    description:
      "Runs a shell command through the workflow runtime service with explicit logging.",
    inputs: [{ name: "command", valueType: "text", required: true }],
    outputs: [{ name: "default", valueType: "action-result" }]
  },
  {
    type: "invoke-shared-action",
    label: "Invoke Shared Action",
    category: "action",
    status: "supported",
    description:
      "Builds and dispatches an existing launcher action without duplicating action logic.",
    inputs: [{ name: "input", valueType: "text" }],
    outputs: [{ name: "default", valueType: "action-result" }]
  },
  {
    type: "invoke-plugin-command",
    label: "Invoke Plugin Command",
    category: "action",
    status: "supported",
    description: "Routes into an existing plugin command through the plugin host.",
    inputs: [{ name: "input", valueType: "text" }],
    outputs: [{ name: "default", valueType: "action-result" }]
  },
  {
    type: "show-launcher-results",
    label: "Show Launcher Results",
    category: "output",
    status: "supported",
    description:
      "Either queries launcher providers or maps structured workflow data into real launcher results.",
    inputs: [
      {
        name: "query",
        valueType: "text",
        acceptedValueTypes: ["text", "url"]
      },
      {
        name: "items",
        valueType: "object",
        acceptedValueTypes: ["object", "http-response", "result-list"]
      }
    ],
    outputs: [{ name: "default", valueType: "result-list" }]
  },
  {
    type: "return-text",
    label: "Return Text",
    category: "output",
    status: "supported",
    description: "Returns a text result to the workflow runner and debug panel.",
    inputs: [
      {
        name: "text",
        valueType: "text",
        acceptedValueTypes: [
          "text",
          "url",
          "number",
          "object",
          "http-response",
          "boolean",
          "action-result"
        ],
        required: true
      }
    ],
    outputs: [{ name: "default", valueType: "text" }]
  },
  {
    type: "return-files",
    label: "Return Files",
    category: "output",
    status: "planned",
    description: "Planned scaffold for returning file lists as workflow output.",
    inputs: [{ name: "files", valueType: "file-list", required: true }],
    outputs: [{ name: "default", valueType: "file-list" }]
  },
  {
    type: "return-action-result",
    label: "Return Action Result",
    category: "output",
    status: "supported",
    description: "Returns the last shared action or plugin action result.",
    inputs: [{ name: "result", valueType: "action-result", required: true }],
    outputs: [{ name: "default", valueType: "action-result" }]
  },
  {
    type: "emit-toast",
    label: "Emit Toast",
    category: "output",
    status: "supported",
    description:
      "Emits a lightweight status message through the workflow runtime service.",
    inputs: [{ name: "text", valueType: "text", required: true }],
    outputs: [{ name: "default", valueType: "action-result" }]
  }
];

export const WORKFLOW_NODE_LIBRARY_BY_TYPE = Object.fromEntries(
  WORKFLOW_NODE_LIBRARY.map((node) => [node.type, node])
) as Record<WorkflowNodeType, WorkflowNodeDefinition>;
