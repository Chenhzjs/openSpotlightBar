import type { WorkflowRecord } from "@pulse/shared-types";

const BUILTIN_TIMESTAMP = 1_710_000_000_000;

export function getBuiltInWorkflows(): WorkflowRecord[] {
  const googleWorkflow = createGoogleWorkflow();
  const jiraWorkflow = createJiraWorkflow();
  const githubHttpWorkflow = createGitHubHttpWorkflow();
  const weatherWorkflow = createWeatherWorkflow();

  return [
    createReusableNormalizeQueryWorkflow(),
    createReusableBuildSearchUrlWorkflow(),
    createReusableGitHubItemsWorkflow(),
    googleWorkflow,
    createKeywordWorkflowVariant(googleWorkflow, {
      id: "builtin-google-keyword",
      name: "Google Search Keyword",
      description: "Run g {query} to launch a Google search directly from launcher input.",
      keyword: "g",
      aliases: ["google"],
      tags: ["keyword", "web", "demo"]
    }),
    jiraWorkflow,
    createKeywordWorkflowVariant(jiraWorkflow, {
      id: "builtin-jira-keyword",
      name: "Jira Ticket Keyword",
      description: "Run jira {ticket} to open a Jira issue directly from launcher input.",
      keyword: "jira",
      argumentName: "ticket",
      placeholder: "ENG-123",
      tags: ["keyword", "web", "demo"]
    }),
    createClipCleanWorkflow(),
    createEchoWorkflow(),
    createJsonPrettyWorkflow(),
    createUrlEncodeWorkflow(),
    createReindexWorkflow(),
    createGitHubWorkflow(),
    githubHttpWorkflow,
    createKeywordWorkflowVariant(githubHttpWorkflow, {
      id: "builtin-gh-keyword",
      name: "GitHub Search Keyword",
      description: "Run gh {query} to search GitHub repositories and return launcher-native results.",
      keyword: "gh",
      aliases: ["github"],
      tags: ["keyword", "http", "demo", "launcher-results"]
    }),
    weatherWorkflow,
    createKeywordWorkflowVariant(weatherWorkflow, {
      id: "builtin-weather-keyword",
      name: "Weather Keyword",
      description: "Run weather {location} to fetch a lightweight weather snapshot from launcher input.",
      keyword: "weather",
      argumentName: "location",
      placeholder: "Shanghai",
      tags: ["keyword", "http", "demo", "text"]
    }),
    createHttpGetWorkflow()
  ];
}

function createKeywordWorkflowVariant(
  workflow: WorkflowRecord,
  options: {
    id: string;
    name: string;
    description: string;
    keyword: string;
    aliases?: string[];
    argumentName?: string;
    placeholder?: string;
    tags: string[];
  }
): WorkflowRecord {
  const cloned = JSON.parse(JSON.stringify(workflow)) as WorkflowRecord;

  return {
    ...cloned,
    id: options.id,
    name: options.name,
    description: options.description,
    tags: [...new Set(options.tags)],
    trigger: {
      type: "keyword",
      label: options.keyword,
      enabled: true,
      keyword: options.keyword,
      aliases: options.aliases ?? [],
      argumentName: options.argumentName ?? "query",
      placeholder:
        options.placeholder ??
        (workflow.trigger.type === "slash-command"
          ? workflow.trigger.placeholder
          : undefined)
    }
  };
}

function createGoogleWorkflow(): WorkflowRecord {
  return {
    id: "builtin-google-search",
    name: "Google Search",
    description: "Run /google {query} to open a Google search in your browser.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "web", "demo"],
    trigger: {
      type: "slash-command",
      label: "/google",
      enabled: true,
      command: "/google",
      argumentName: "query",
      placeholder: "Search query"
    },
    nodes: [
      node("query", "query-input", "Query Input", {}, { x: 0, y: 0 }),
      node("build", "invoke-workflow", "Build Search URL", {
        workflowId: "builtin-reusable-build-search-url",
        inputTemplates: {
          baseUrl: "https://www.google.com/search",
          query: "{{input}}"
        }
      }, { x: 500, y: 0 }),
      node("template", "template", "Select URL", {
        template: "{{inputs.input.url}}",
        outputType: "url"
      }, { x: 1000, y: 0 }),
      node("open", "open-url", "Open URL", {}, { x: 1500, y: 0 }),
      node("return", "return-action-result", "Return Action Result", {}, { x: 2000, y: 0 })
    ],
    edges: [
      edge("query", "default", "build", "input"),
      edge("build", "default", "template", "input"),
      edge("template", "default", "open", "url"),
      edge("open", "default", "return", "result")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createJiraWorkflow(): WorkflowRecord {
  return {
    id: "builtin-jira-ticket",
    name: "Jira Ticket",
    description: "Run /jira {ticket} to open a Jira issue directly.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "web", "demo"],
    trigger: {
      type: "slash-command",
      label: "/jira",
      enabled: true,
      command: "/jira",
      argumentName: "ticket",
      placeholder: "ENG-123"
    },
    nodes: [
      node("query", "query-input", "Ticket Input", {}, { x: 0, y: 0 }),
      node("template", "template", "Build Jira URL", {
        template: "https://jira.example.com/browse/{{args.ticket | upper}}",
        outputType: "url"
      }, { x: 500, y: 0 }),
      node("open", "open-url", "Open URL", {}, { x: 1000, y: 0 }),
      node("return", "return-action-result", "Return Action Result", {}, { x: 1500, y: 0 })
    ],
    edges: [
      edge("query", "default", "template", "input"),
      edge("template", "default", "open", "url"),
      edge("open", "default", "return", "result")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createClipCleanWorkflow(): WorkflowRecord {
  return {
    id: "builtin-clip-clean",
    name: "Clipboard Clean",
    description: "Run /clip-clean to normalize whitespace and copy the cleaned text back.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "clipboard", "demo"],
    trigger: {
      type: "slash-command",
      label: "/clip-clean",
      enabled: true,
      command: "/clip-clean",
      argumentName: "query",
      placeholder: "Uses clipboard input"
    },
    nodes: [
      node("clipboard", "clipboard-input", "Clipboard Input", {}, { x: 0, y: 0 }),
      node("clean", "regex-replace", "Collapse Whitespace", {
        pattern: "\\s+",
        replacement: " "
      }, { x: 500, y: 0 }),
      node("copy", "copy-to-clipboard", "Copy Clean Text", {}, { x: 1000, y: 0 }),
      node("return", "return-action-result", "Return Action Result", {}, { x: 1500, y: 0 })
    ],
    edges: [
      edge("clipboard", "default", "clean", "input"),
      edge("clean", "default", "copy", "text"),
      edge("copy", "default", "return", "result")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createEchoWorkflow(): WorkflowRecord {
  return {
    id: "builtin-echo",
    name: "Echo Text",
    description: "Run /echo {text} to return text directly from the workflow runtime.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "demo", "text"],
    trigger: {
      type: "slash-command",
      label: "/echo",
      enabled: true,
      command: "/echo",
      argumentName: "text",
      placeholder: "Any text"
    },
    nodes: [
      node("query", "query-input", "Text Input", {}, { x: 0, y: 0 }),
      node("return", "return-text", "Return Text", {}, { x: 500, y: 0 })
    ],
    edges: [edge("query", "default", "return", "text")],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createJsonPrettyWorkflow(): WorkflowRecord {
  return {
    id: "builtin-json-pretty",
    name: "JSON Pretty Print",
    description: "Run /json-pretty {json} to parse JSON and return formatted output.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "json", "demo"],
    trigger: {
      type: "slash-command",
      label: "/json-pretty",
      enabled: true,
      command: "/json-pretty",
      argumentName: "json",
      placeholder: "{\"hello\": \"world\"}"
    },
    nodes: [
      node("query", "query-input", "JSON Input", {}, { x: 0, y: 0 }),
      node("parse", "json-parse", "Parse JSON", {}, { x: 500, y: 0 }),
      node("template", "template", "Pretty JSON", {
        template: "{{inputs.input | prettyjson}}",
        outputType: "text"
      }, { x: 1000, y: 0 }),
      node("return", "return-text", "Return Text", {}, { x: 1500, y: 0 })
    ],
    edges: [
      edge("query", "default", "parse", "input"),
      edge("parse", "default", "template", "input"),
      edge("template", "default", "return", "text")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createUrlEncodeWorkflow(): WorkflowRecord {
  return {
    id: "builtin-url-encode",
    name: "URL Encode",
    description: "Run /url-encode {text} to return a percent-encoded string.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "text", "demo"],
    trigger: {
      type: "slash-command",
      label: "/url-encode",
      enabled: true,
      command: "/url-encode",
      argumentName: "text",
      placeholder: "Text to encode"
    },
    nodes: [
      node("query", "query-input", "Text Input", {}, { x: 0, y: 0 }),
      node("template", "template", "Encode", {
        template: "{{args.text | urlencode}}",
        outputType: "text"
      }, { x: 500, y: 0 }),
      node("return", "return-text", "Return Text", {}, { x: 1000, y: 0 })
    ],
    edges: [
      edge("query", "default", "template", "input"),
      edge("template", "default", "return", "text")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createReindexWorkflow(): WorkflowRecord {
  return {
    id: "builtin-reindex-now",
    name: "Rebuild File Index",
    description: "Run /reindex-now to invoke the existing shared file index rebuild action.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "indexing", "shared-action"],
    trigger: {
      type: "slash-command",
      label: "/reindex-now",
      enabled: true,
      command: "/reindex-now"
    },
    nodes: [
      node("action", "invoke-shared-action", "Rebuild Index", {
        actionKind: "rebuild-file-index",
        title: "Rebuild file index"
      }, { x: 0, y: 0 }),
      node("return", "return-action-result", "Return Action Result", {}, { x: 500, y: 0 })
    ],
    edges: [edge("action", "default", "return", "result")],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createGitHubWorkflow(): WorkflowRecord {
  return {
    id: "builtin-ghrepo",
    name: "GitHub Repo Search",
    description:
      "Run /ghrepo {query} to route into the existing GitHub plugin command when available.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "plugins", "demo"],
    trigger: {
      type: "slash-command",
      label: "/ghrepo",
      enabled: true,
      command: "/ghrepo",
      argumentName: "query",
      placeholder: "Repository query"
    },
    nodes: [
      node("query", "query-input", "Query Input", {}, { x: 0, y: 0 }),
      node("plugin", "invoke-plugin-command", "Invoke gh Command", {
        command: "gh"
      }, { x: 500, y: 0 }),
      node("return", "return-action-result", "Return Action Result", {}, { x: 1000, y: 0 })
    ],
    edges: [
      edge("query", "default", "plugin", "input"),
      edge("plugin", "default", "return", "result")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createGitHubHttpWorkflow(): WorkflowRecord {
  return {
    id: "builtin-gh-search",
    name: "GitHub Search (HTTP)",
    description:
      "Run /gh-search {query} to fetch GitHub repositories through the workflow HTTP node and show launcher-native results.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "http", "demo", "launcher-results"],
    trigger: {
      type: "slash-command",
      label: "/gh-search",
      enabled: true,
      command: "/gh-search",
      argumentName: "query",
      placeholder: "Repository query"
    },
    nodes: [
      node("query", "query-input", "Query Input", {}, { x: 0, y: 0 }),
      node("request", "http-request", "GitHub Request", {
        method: "GET",
        urlTemplate: "https://api.github.com/search/repositories",
        headersTemplate:
          '{\n  "Accept": "application/vnd.github+json",\n  "User-Agent": "Pulse Launcher"\n}',
        queryParamsTemplate:
          '{\n  "q": "{{args.query}}",\n  "per_page": "5"\n}',
        timeoutMs: 5000
      }, { x: 500, y: 0 }),
      node("items", "invoke-workflow", "Map Repo Items", {
        workflowId: "builtin-reusable-github-items",
        inputTemplates: {
          response: "{{nodes.request.default}}"
        }
      }, { x: 1000, y: 0 }),
      node("results", "show-launcher-results", "Show Repository Results", {
        mode: "items",
        itemsPath: "items",
        titleTemplate: "{{item.full_name}}",
        subtitleTemplate: "{{item.description}}",
        iconTemplate: "github",
        resultType: "url",
        resultSource: "workflows",
        maxItems: 5,
        actionKind: "open-url",
        actionTitle: "Open repository",
        actionPayloadTemplate: '{\n  "url": "{{item.html_url}}"\n}',
        payloadTemplate:
          '{\n  "url": "{{item.html_url}}",\n  "stars": "{{item.stargazers_count}}",\n  "language": "{{item.language}}"\n}'
      }, { x: 1500, y: 0 })
    ],
    edges: [
      edge("query", "default", "request", "input"),
      edge("request", "default", "items", "input"),
      edge("items", "default", "results", "items")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createReusableNormalizeQueryWorkflow(): WorkflowRecord {
  return {
    id: "builtin-reusable-normalize-query",
    name: "Normalize Query",
    description: "Reusable helper that trims and collapses whitespace for downstream search workflows.",
    enabled: true,
    builtIn: true,
    reusable: {
      description: "Accepts raw query text and returns a normalized query string.",
      inputs: [
        {
          name: "query",
          valueType: "text",
          required: true,
          description: "Raw query text from a launcher command or parent workflow."
        }
      ],
      outputs: [
        {
          name: "normalized",
          valueType: "text",
          description: "Whitespace-normalized query string.",
          valueTemplate: "{{nodes.clean.default | trim}}"
        }
      ]
    },
    tags: ["reusable", "text", "built-in"],
    trigger: {
      type: "manual",
      label: "Normalize Query",
      enabled: true
    },
    nodes: [
      node("query", "template", "Forward Query", {
        template: "{{args.query}}",
        outputType: "text"
      }, { x: 0, y: 0 }),
      node("clean", "regex-replace", "Collapse Whitespace", {
        pattern: "\\s+",
        replacement: " ",
        flags: "g"
      }, { x: 500, y: 0 }),
      node("return", "return-text", "Return Text", {}, { x: 1000, y: 0 })
    ],
    edges: [
      edge("query", "default", "clean", "input"),
      edge("clean", "default", "return", "text")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createReusableBuildSearchUrlWorkflow(): WorkflowRecord {
  return {
    id: "builtin-reusable-build-search-url",
    name: "Build Search URL",
    description: "Reusable helper that builds a search URL from a base URL and normalized query.",
    enabled: true,
    builtIn: true,
    reusable: {
      description: "Returns a URL field that parent workflows can open or reuse.",
      inputs: [
        {
          name: "baseUrl",
          valueType: "url",
          required: true,
          description: "Base search URL without the query string."
        },
        {
          name: "query",
          valueType: "text",
          required: true,
          description: "Search text to append as the q parameter."
        }
      ],
      outputs: [
        {
          name: "url",
          valueType: "url",
          description: "Composed search URL.",
          valueTemplate: "{{nodes.url.default}}"
        }
      ]
    },
    tags: ["reusable", "url", "built-in"],
    trigger: {
      type: "manual",
      label: "Build Search URL",
      enabled: true
    },
    nodes: [
      node("normalize", "invoke-workflow", "Normalize Query", {
        workflowId: "builtin-reusable-normalize-query",
        inputTemplates: {
          query: "{{args.query}}"
        }
      }, { x: 0, y: 0 }),
      node("url", "template", "Compose URL", {
        template: "{{args.baseUrl}}?q={{nodes.normalize.default.normalized | urlencode}}",
        outputType: "url"
      }, { x: 500, y: 0 }),
      node("return", "return-text", "Return Text", {}, { x: 1000, y: 0 })
    ],
    edges: [
      edge("normalize", "default", "url", "input"),
      edge("url", "default", "return", "text")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createReusableGitHubItemsWorkflow(): WorkflowRecord {
  return {
    id: "builtin-reusable-github-items",
    name: "GitHub Response Items",
    description: "Reusable helper that extracts the items array from a GitHub repository search response.",
    enabled: true,
    builtIn: true,
    reusable: {
      description: "Returns the repository items array for workflow-produced launcher results.",
      inputs: [
        {
          name: "response",
          valueType: "http-response",
          required: true,
          description: "GitHub search API HTTP response."
        }
      ],
      outputs: [
        {
          name: "items",
          valueType: "object",
          description: "Array of repository results.",
          valueTemplate: "{{nodes.items.default}}"
        }
      ]
    },
    tags: ["reusable", "http", "built-in"],
    trigger: {
      type: "manual",
      label: "GitHub Items",
      enabled: true
    },
    nodes: [
      node("response", "template", "Forward Response", {
        template: "{{args.response}}",
        outputType: "object"
      }, { x: 0, y: 0 }),
      node("items", "json-extract", "Extract Items", {
        path: "json.items",
        outputType: "object"
      }, { x: 500, y: 0 }),
      node("return", "return-text", "Return Text", {
        template: "{{nodes.items.default | json}}"
      }, { x: 1000, y: 0 })
    ],
    edges: [
      edge("response", "default", "items", "input"),
      edge("items", "default", "return", "text")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createWeatherWorkflow(): WorkflowRecord {
  return {
    id: "builtin-weather",
    name: "Weather Snapshot",
    description:
      "Run /weather {location} to fetch a lightweight weather snapshot and return a readable summary.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "http", "demo", "text"],
    trigger: {
      type: "slash-command",
      label: "/weather",
      enabled: true,
      command: "/weather",
      argumentName: "location",
      placeholder: "Shanghai"
    },
    nodes: [
      node("query", "query-input", "Location Input", {}, { x: 0, y: 0 }),
      node("request", "http-request", "Weather Request", {
        method: "GET",
        urlTemplate: "https://wttr.in/{{args.location | urlencode}}",
        queryParamsTemplate: '{\n  "format": "j1"\n}',
        timeoutMs: 5000
      }, { x: 500, y: 0 }),
      node("summary", "template", "Build Weather Summary", {
        template:
          "{{nodes.request.default.json.current_condition.0.temp_C}}°C · {{nodes.request.default.json.current_condition.0.weatherDesc.0.value}} · feels like {{nodes.request.default.json.current_condition.0.FeelsLikeC}}°C",
        outputType: "text"
      }, { x: 1000, y: 0 }),
      node("return", "return-text", "Return Text", {}, { x: 1500, y: 0 })
    ],
    edges: [
      edge("query", "default", "request", "input"),
      edge("request", "default", "summary", "input"),
      edge("summary", "default", "return", "text")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function createHttpGetWorkflow(): WorkflowRecord {
  return {
    id: "builtin-http-get",
    name: "HTTP GET Preview",
    description:
      "Run /http-get {url} to issue a GET request and return the response text or JSON preview.",
    enabled: true,
    builtIn: true,
    tags: ["slash-command", "http", "debug"],
    trigger: {
      type: "slash-command",
      label: "/http-get",
      enabled: true,
      command: "/http-get",
      argumentName: "url",
      placeholder: "https://api.github.com"
    },
    nodes: [
      node("query", "query-input", "URL Input", {}, { x: 0, y: 0 }),
      node("request", "http-request", "HTTP Request", {
        method: "GET",
        urlTemplate: "{{args.url}}",
        headersTemplate: '{\n  "Accept": "application/json"\n}',
        timeoutMs: 5000
      }, { x: 500, y: 0 }),
      node("preview", "template", "Preview Response", {
        template: "{{nodes.request.default.json | prettyjson}}",
        outputType: "text"
      }, { x: 1000, y: 0 }),
      node("return", "return-text", "Return Text", {}, { x: 1500, y: 0 })
    ],
    edges: [
      edge("query", "default", "request", "input"),
      edge("request", "default", "preview", "input"),
      edge("preview", "default", "return", "text")
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  };
}

function node(
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
    status:
      type === "file-input" || type === "return-files"
        ? "planned"
        : "supported",
    config,
    ...(position ? { position } : {})
  };
}

function edge(
  fromNodeId: string,
  fromPort: string,
  toNodeId: string,
  toInput: string
): WorkflowRecord["edges"][number] {
  return {
    id: `${fromNodeId}:${fromPort}->${toNodeId}:${toInput}`,
    fromNodeId,
    fromPort,
    toNodeId,
    toInput
  };
}
