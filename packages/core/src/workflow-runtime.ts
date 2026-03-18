import type {
  ActionItem,
  ActionResponse,
  ResultItem,
  ResultItemType,
  ResultSource,
  WorkflowHttpRequest,
  WorkflowHttpResponse,
  WorkflowExecutionLog,
  WorkflowLogValuePreview,
  WorkflowRecord,
  WorkflowRunContext,
  WorkflowRunResult,
  WorkflowValidationIssue,
  WorkflowValueType
} from "@pulse/shared-types";

import {
  renderWorkflowTemplate,
  resolveWorkflowTemplateValue,
  stringifyWorkflowReferenceValue,
  type WorkflowReferenceEnvironment
} from "./workflow-references";
import { WORKFLOW_NODE_LIBRARY_BY_TYPE } from "./workflow-library";
import { buildReusableWorkflowRunContext } from "./workflow-utils";
import { validateWorkflow, type WorkflowValidationOptions } from "./workflow-validation";

interface RuntimeValue {
  type: WorkflowValueType;
  value: unknown;
}

interface NodeExecutionResult {
  outputs: Record<string, RuntimeValue>;
  returnedText?: string;
  returnedFiles?: string[];
  actionResponse?: ActionResponse;
  resultItems?: ResultItem[];
  nestedLogs?: WorkflowExecutionLog[];
}

interface InternalWorkflowRunResult extends WorkflowRunResult {
  nodeOutputs: Map<string, Record<string, RuntimeValue>>;
}

export interface WorkflowRuntimeOptions extends WorkflowValidationOptions {
  executionStack?: string[];
}

export interface WorkflowRuntimeServices {
  getClipboardText(): Promise<string>;
  performSharedAction(action: ActionItem, result?: ResultItem): Promise<ActionResponse>;
  runShellCommand(command: string): Promise<ActionResponse>;
  invokePluginCommand(
    command: string,
    input: string,
    context: WorkflowRunContext
  ): Promise<ActionResponse>;
  requestHttp?(request: WorkflowHttpRequest): Promise<WorkflowHttpResponse>;
  searchLauncher?(query: string): Promise<ResultItem[]>;
  emitToast?(message: string): Promise<void>;
}

export async function runWorkflow(
  workflow: WorkflowRecord,
  context: WorkflowRunContext,
  services: WorkflowRuntimeServices,
  options: WorkflowRuntimeOptions = {}
): Promise<WorkflowRunResult> {
  const result = await runWorkflowInternal(workflow, context, services, options);
  return {
    ok: result.ok,
    workflowId: result.workflowId,
    logs: result.logs,
    validationIssues: result.validationIssues,
    failureStage: result.failureStage,
    returnedText: result.returnedText,
    returnedFiles: result.returnedFiles,
    actionResponse: result.actionResponse,
    resultItems: result.resultItems,
    error: result.error
  };
}

async function runWorkflowInternal(
  workflow: WorkflowRecord,
  context: WorkflowRunContext,
  services: WorkflowRuntimeServices,
  options: WorkflowRuntimeOptions
): Promise<InternalWorkflowRunResult> {
  const validationIssues = validateWorkflow(workflow, {
    workflowCatalog: options.workflowCatalog
  });
  if (validationIssues.some((issue) => issue.level === "error")) {
    return {
      ok: false,
      workflowId: workflow.id,
      logs: [],
      validationIssues,
      failureStage: "validation",
      error: "Workflow validation failed.",
      nodeOutputs: new Map()
    };
  }

  const logs: WorkflowExecutionLog[] = [];
  const incoming = new Map<string, typeof workflow.edges>();
  const outputs = new Map<string, Record<string, RuntimeValue>>();

  for (const edge of workflow.edges) {
    incoming.set(edge.toNodeId, [...(incoming.get(edge.toNodeId) ?? []), edge]);
  }

  const orderedNodes = topologicalSort(workflow);
  let returnedText: string | undefined;
  let returnedFiles: string[] | undefined;
  let actionResponse: ActionResponse | undefined;
  let resultItems: ResultItem[] | undefined;

  for (const node of orderedNodes) {
    const startedAt = Date.now();
    const definition = WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type];
    const inbound = incoming.get(node.id) ?? [];
    const providedInputs: Record<string, RuntimeValue> = {};

    for (const edge of inbound) {
      const sourceOutputs = outputs.get(edge.fromNodeId);
      const sourceValue = sourceOutputs?.[edge.fromPort];
      if (sourceValue) {
        providedInputs[edge.toInput] = sourceValue;
      }
    }

    if (inbound.length > 0 && Object.keys(providedInputs).length === 0) {
      logs.push(
        createLogEntry(node, startedAt, "skipped", {
          error: "Skipped because no active upstream branch reached this node."
        })
      );
      continue;
    }

    const missingInputs = definition.inputs
      .filter((input) => input.required)
      .filter((input) => !providedInputs[input.name] && !configValueForInput(node.config, input.name))
      .map((input) => input.name);

    if (missingInputs.length > 0) {
      logs.push(
        createLogEntry(node, startedAt, "skipped", {
          error: `Skipped because required inputs were unavailable: ${missingInputs.join(", ")}.`,
          inputPreview: previewInputs(providedInputs)
        })
      );
      continue;
    }

    try {
      const result = await executeNode(
        workflow,
        node,
        providedInputs,
        context,
        outputs,
        services,
        options
      );
      outputs.set(node.id, result.outputs);
      if (result.returnedText !== undefined) {
        returnedText = result.returnedText;
      }
      if (result.returnedFiles !== undefined) {
        returnedFiles = result.returnedFiles;
      }
      if (result.actionResponse !== undefined) {
        actionResponse = result.actionResponse;
      }
      if (result.resultItems !== undefined) {
        resultItems = result.resultItems;
      }

      logs.push(
        createLogEntry(node, startedAt, "success", {
          inputPreview: previewInputs(providedInputs),
          outputPreview: previewOutputs(result.outputs),
          nestedLogs: result.nestedLogs
        })
      );
    } catch (error) {
      logs.push(
        createLogEntry(node, startedAt, "error", {
          inputPreview: previewInputs(providedInputs),
          error: error instanceof Error ? error.message : String(error)
        })
      );

      return {
        ok: false,
        workflowId: workflow.id,
        logs,
        validationIssues,
        failureStage: "runtime",
        returnedText,
        returnedFiles,
        actionResponse,
        resultItems,
        error: error instanceof Error ? error.message : "Workflow execution failed.",
        nodeOutputs: outputs
      };
    }
  }

  return {
    ok: true,
    workflowId: workflow.id,
    logs,
    validationIssues,
    returnedText,
    returnedFiles,
    actionResponse,
    resultItems,
    nodeOutputs: outputs
  };
}

async function executeNode(
  workflow: WorkflowRecord,
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  context: WorkflowRunContext,
  nodeOutputs: Map<string, Record<string, RuntimeValue>>,
  services: WorkflowRuntimeServices,
  options: WorkflowRuntimeOptions
): Promise<NodeExecutionResult> {
  const referenceEnvironment = buildReferenceEnvironment(context, inputs, nodeOutputs);

  switch (node.type) {
    case "query-input":
      return {
        outputs: {
          default: textValue(context.argsText ?? context.rawInput)
        }
      };
    case "clipboard-input": {
      const text = context.clipboardText ?? (await services.getClipboardText());
      return {
        outputs: {
          default: textValue(text)
        }
      };
    }
    case "static-value": {
      const valueType = normalizeValueType(node.config.valueType) ?? "text";
      const rawValue =
        typeof node.config.value === "string"
          ? resolveWorkflowTemplateValue(node.config.value, referenceEnvironment)
          : node.config.value;

      return {
        outputs: {
          default: createRuntimeValue(
            coerceRuntimeValue(rawValue, valueType, `${node.title} output`),
            valueType
          )
        }
      };
    }
    case "http-request": {
      if (!services.requestHttp) {
        throw new Error(`${node.title} requires HTTP request support in the workflow host.`);
      }

      const request = buildHttpRequest(node, referenceEnvironment);
      const response = await services.requestHttp(request);
      const parsedJson =
        response.json === undefined ? tryParseHttpJson(response.text, response.contentType) : response.json;
      const normalizedResponse: WorkflowHttpResponse = {
        ...response,
        headers: response.headers ?? {},
        contentType: response.contentType ?? null,
        json: parsedJson
      };

      return {
        outputs: {
          default: createRuntimeValue(normalizedResponse, "http-response"),
          status: createRuntimeValue(normalizedResponse.status, "number"),
          ok: createRuntimeValue(normalizedResponse.ok, "boolean"),
          text: textValue(normalizedResponse.text),
          json: createRuntimeValue(normalizedResponse.json ?? null, "object"),
          headers: createRuntimeValue(normalizedResponse.headers ?? {}, "object")
        }
      };
    }
    case "invoke-workflow": {
      const targetWorkflowId = String(node.config.workflowId ?? "").trim();
      if (!targetWorkflowId) {
        throw new Error(`${node.title} requires a reusable workflow id.`);
      }

      const workflowCatalog = options.workflowCatalog ?? [];
      const targetWorkflow = workflowCatalog.find((entry) => entry.id === targetWorkflowId);
      if (!targetWorkflow) {
        throw new Error(`${node.title} references missing workflow '${targetWorkflowId}'.`);
      }

      if (!targetWorkflow.reusable) {
        throw new Error(`${node.title} can only invoke workflows marked reusable.`);
      }

      const executionStack = options.executionStack ?? [workflow.id];
      if (executionStack.includes(targetWorkflowId)) {
        throw new Error(
          `${node.title} cannot invoke '${targetWorkflow.name}' because it would recurse through the workflow dependency stack.`
        );
      }

      const reusableInputs = buildReusableWorkflowInputs(
        node,
        targetWorkflow,
        inputs,
        referenceEnvironment
      );
      const childContext = buildReusableWorkflowRunContext(targetWorkflow, reusableInputs, {
        clipboardText: context.clipboardText,
        files: context.files,
        launcherQuery: context.launcherQuery
      });
      const childRun = await runWorkflowInternal(targetWorkflow, childContext, services, {
        ...options,
        executionStack: [...executionStack, targetWorkflowId]
      });

      if (!childRun.ok) {
        throw new Error(
          `${node.title} failed while running '${targetWorkflow.name}': ${
            childRun.error ?? "Subflow execution failed."
          }`
        );
      }

      const reusableOutputs = resolveReusableWorkflowOutputs(targetWorkflow, childContext, childRun);
      return {
        outputs: {
          default: createRuntimeValue(reusableOutputs, "object")
        },
        nestedLogs: childRun.logs
      };
    }
    case "template": {
      const template = String(node.config.template ?? "");
      const outputType = normalizeValueType(node.config.outputType) ?? "text";
      const rawValue = resolveWorkflowTemplateValue(template, referenceEnvironment);

      return {
        outputs: {
          default: createRuntimeValue(
            coerceRuntimeValue(rawValue, outputType, `${node.title} output`),
            outputType
          )
        }
      };
    }
    case "regex-replace": {
      const input = readRuntimeTextInput(node, inputs, "input");
      const pattern = resolveConfigText(node.config.pattern, referenceEnvironment);
      const flags = resolveConfigText(node.config.flags, referenceEnvironment);
      const replacement = resolveConfigText(node.config.replacement, referenceEnvironment);
      let regex: RegExp;

      try {
        regex = new RegExp(pattern, flags);
      } catch (error) {
        throw new Error(
          `${node.title} has an invalid regex pattern or flags: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      return {
        outputs: {
          default: textValue(input.replace(regex, replacement))
        }
      };
    }
    case "conditional-branch": {
      const input = readRuntimeValue(node, inputs, "input", [
        "text",
        "url",
        "number",
        "object",
        "http-response",
        "boolean"
      ]);
      const compareValue = resolveWorkflowTemplateValue(
        String(node.config.compareValue ?? ""),
        referenceEnvironment
      );
      const passed = evaluateCondition(input.value, compareValue, node.config);
      return {
        outputs: {
          [passed ? "true" : "false"]: {
            type: input.type,
            value: input.value
          }
        }
      };
    }
    case "json-parse": {
      const input = readRuntimeTextInput(node, inputs, "input");
      return {
        outputs: {
          default: createRuntimeValue(parseJsonValue(input, node.title), "object")
        }
      };
    }
    case "json-extract": {
      const input = readRuntimeValue(node, inputs, "input", ["object", "http-response", "text"]);
      const sourceObject =
        input.type === "text" ? parseJsonValue(String(input.value ?? ""), node.title) : input.value;
      const path = resolveConfigText(node.config.path, referenceEnvironment);
      let extracted = path ? getPathValue(sourceObject, path) : sourceObject;

      if (extracted === undefined && node.config.fallback !== undefined) {
        extracted =
          typeof node.config.fallback === "string"
            ? resolveWorkflowTemplateValue(node.config.fallback, referenceEnvironment)
            : node.config.fallback;
      }

      if (extracted === undefined) {
        throw new Error(
          `${node.title} could not find path '${path || "<root>"}' in the provided object.`
        );
      }

      const outputType = normalizeValueType(node.config.outputType) ?? inferRuntimeValueType(extracted);
      return {
        outputs: {
          default: createRuntimeValue(
            coerceRuntimeValue(extracted, outputType, `${node.title} output`),
            outputType
          )
        }
      };
    }
    case "open-url": {
      const url =
        readOptionalRuntimeValueAsText(node, inputs, "url", ["url", "text"]) ??
        resolveConfigText(node.config.urlTemplate, referenceEnvironment);
      const response = await services.performSharedAction({
        id: `${node.id}:open-url`,
        title: "Open URL",
        kind: "open-url",
        payload: { url }
      });
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "copy-to-clipboard": {
      const text =
        readOptionalRuntimeValueAsText(node, inputs, "text", [
          "text",
          "url",
          "number",
          "object",
          "http-response",
          "boolean"
        ]) ??
        resolveConfigText(node.config.textTemplate, referenceEnvironment);
      const response = await services.performSharedAction({
        id: `${node.id}:copy-text`,
        title: "Copy to clipboard",
        kind: "copy-text",
        payload: { text }
      });
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "open-file": {
      const path =
        readOptionalRuntimeValueAsText(node, inputs, "path", ["file", "text"]) ??
        resolveConfigText(node.config.pathTemplate, referenceEnvironment);
      const response = await services.performSharedAction({
        id: `${node.id}:open-file`,
        title: "Open file",
        kind: "open-path",
        payload: { path }
      });
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "run-shell-command": {
      const command =
        readOptionalRuntimeValueAsText(node, inputs, "command", ["text"]) ??
        resolveConfigText(node.config.commandTemplate, referenceEnvironment);
      const response = await services.runShellCommand(command);
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "invoke-shared-action": {
      const payloadTemplates =
        (node.config.payloadTemplates as Record<string, string> | undefined) ?? {};
      const payload = Object.fromEntries(
        Object.entries(payloadTemplates).map(([key, template]) => [
          key,
          resolveWorkflowTemplateValue(template, referenceEnvironment)
        ])
      );
      const inlineInput = readOptionalRuntimeValueAsText(node, inputs, "input", [
        "text",
        "url",
        "number",
        "object",
        "http-response",
        "boolean"
      ]);
      if (inlineInput && payload.text === undefined) {
        payload.text = inlineInput;
      }
      const response = await services.performSharedAction({
        id: `${node.id}:shared-action`,
        title: String(node.config.title ?? "Workflow action"),
        kind: node.config.actionKind as ActionItem["kind"],
        description:
          typeof node.config.description === "string" ? node.config.description : undefined,
        payload
      });
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "invoke-plugin-command": {
      const command = String(node.config.command ?? "");
      const textInput =
        readOptionalRuntimeValueAsText(node, inputs, "input", [
          "text",
          "url",
          "number",
          "object",
          "http-response"
        ]) ??
        resolveConfigText(node.config.argumentTemplate, referenceEnvironment);
      const response = await services.invokePluginCommand(command, textInput, context);
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "show-launcher-results": {
      const mode = String(node.config.mode ?? "query");
      const results =
        mode === "items"
          ? buildLauncherResultsFromWorkflow(node, inputs, referenceEnvironment)
          : await searchLauncherFromWorkflow(node, inputs, referenceEnvironment, services);
      return {
        outputs: {
          default: createRuntimeValue(results, "result-list")
        },
        resultItems: results
      };
    }
    case "return-text": {
      const value =
        readOptionalRuntimeValue(node, inputs, "text", [
          "text",
          "url",
          "number",
          "object",
          "http-response",
          "boolean",
          "action-result"
        ]) ??
        createRuntimeValue(
          resolveWorkflowTemplateValue(String(node.config.template ?? ""), referenceEnvironment),
          "text"
        );
      const text = stringifyValueForDisplay(value);
      return {
        outputs: {
          default: textValue(text)
        },
        returnedText: text
      };
    }
    case "return-action-result": {
      const response = readActionResult(node, inputs, "result");
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "emit-toast": {
      const text =
        readOptionalRuntimeValueAsText(node, inputs, "text", [
          "text",
          "url",
          "number",
          "object",
          "http-response",
          "boolean"
        ]) ??
        resolveConfigText(node.config.textTemplate, referenceEnvironment);
      if (!services.emitToast) {
        throw new Error(`${node.title} requires host toast or notification support.`);
      }
      await services.emitToast(text);
      const response = {
        ok: true,
        message: text
      } satisfies ActionResponse;
      return {
        outputs: {
          default: actionResultValue(response)
        },
        actionResponse: response
      };
    }
    case "file-input":
    case "return-files":
      throw new Error(`${WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type].label} is planned only.`);
    default:
      throw new Error(`Unsupported node type: ${(node as { type: string }).type}`);
  }
}

async function searchLauncherFromWorkflow(
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  referenceEnvironment: WorkflowReferenceEnvironment,
  services: WorkflowRuntimeServices
): Promise<ResultItem[]> {
  const launcherQuery =
    readOptionalRuntimeValueAsText(node, inputs, "query", ["text", "url"]) ??
    resolveConfigText(node.config.queryTemplate, referenceEnvironment);
  if (!services.searchLauncher) {
    throw new Error(`${node.title} requires launcher search integration in the host.`);
  }
  return services.searchLauncher(launcherQuery);
}

function buildLauncherResultsFromWorkflow(
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  referenceEnvironment: WorkflowReferenceEnvironment
): ResultItem[] {
  const sourceInput = readRuntimeValue(node, inputs, "items", ["object", "http-response", "result-list"]);
  if (sourceInput.type === "result-list") {
    return sourceInput.value as ResultItem[];
  }

  const collection = selectWorkflowResultCollection(sourceInput.value, node.config.itemsPath);
  if (!Array.isArray(collection)) {
    throw new Error(
      `${node.title} expected an array of items${node.config.itemsPath ? ` at path '${String(node.config.itemsPath)}'` : ""}.`
    );
  }

  const maxItems = normalizePositiveNumber(node.config.maxItems) ?? 8;
  const resultType = normalizeResultItemType(node.config.resultType);
  const resultSource = normalizeResultSource(node.config.resultSource);
  const score = normalizeScore(node.config.score);
  const actionKind = typeof node.config.actionKind === "string" ? node.config.actionKind : "noop";
  const actionTitle =
    typeof node.config.actionTitle === "string" && node.config.actionTitle.trim().length > 0
      ? node.config.actionTitle
      : "Open result";

  return collection.slice(0, maxItems).map((item, index) => {
    const itemEnvironment = extendReferenceEnvironment(referenceEnvironment, {
      item: { type: inferRuntimeValueType(item), value: item },
      index: { type: "number", value: index }
    });
    const title = renderWorkflowTemplate(String(node.config.titleTemplate ?? "{{item}}"), itemEnvironment).trim();
    if (!title) {
      throw new Error(`${node.title} produced a launcher result without a title.`);
    }

    const subtitle = optionalRenderedText(node.config.subtitleTemplate, itemEnvironment);
    const icon = optionalRenderedText(node.config.iconTemplate, itemEnvironment);
    const payload = resolveTemplateObjectConfig(
      node.config.payloadTemplate,
      itemEnvironment,
      `${node.title} payload template`
    );
    const actionPayload =
      resolveTemplateObjectConfig(
        node.config.actionPayloadTemplate,
        itemEnvironment,
        `${node.title} action payload template`
      ) ?? payload;

    const defaultAction: ActionItem = {
      id: `${node.id}:item-action:${index}`,
      title: actionTitle,
      kind: actionKind as ActionItem["kind"],
      payload: isRecord(actionPayload) ? actionPayload : undefined
    };

    return {
      id:
        optionalRenderedText(node.config.idTemplate, itemEnvironment) ??
        `${node.id}:item:${index}:${title.toLowerCase().replace(/\s+/g, "-")}`,
      title,
      subtitle: subtitle || undefined,
      type: resultType ?? deriveResultTypeFromAction(defaultAction.kind),
      source: resultSource ?? "workflows",
      icon: icon || undefined,
      score,
      actions: [defaultAction],
      payload: isRecord(payload) ? payload : isRecord(actionPayload) ? actionPayload : {}
    } satisfies ResultItem;
  });
}

function buildHttpRequest(
  node: WorkflowRecord["nodes"][number],
  referenceEnvironment: WorkflowReferenceEnvironment
): WorkflowHttpRequest {
  const method = String(node.config.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw new Error(`${node.title} only supports GET and POST requests in runtime v1.`);
  }

  const url = resolveConfigText(node.config.urlTemplate, referenceEnvironment).trim();
  if (!url) {
    throw new Error(`${node.title} requires a URL template.`);
  }

  const headers = normalizeStringRecord(
    resolveTemplateObjectConfig(node.config.headersTemplate, referenceEnvironment, `${node.title} headers`)
  );
  const queryParams = normalizeStringRecord(
    resolveTemplateObjectConfig(
      node.config.queryParamsTemplate,
      referenceEnvironment,
      `${node.title} query params`
    )
  );
  const jsonBody = resolveTemplateObjectConfig(
    node.config.jsonBodyTemplate,
    referenceEnvironment,
    `${node.title} JSON body`
  );
  const timeoutMs = normalizePositiveNumber(node.config.timeoutMs) ?? 5000;

  return {
    method,
    url,
    headers,
    queryParams,
    jsonBody,
    timeoutMs
  };
}

function buildReusableWorkflowInputs(
  node: WorkflowRecord["nodes"][number],
  targetWorkflow: WorkflowRecord,
  inputs: Record<string, RuntimeValue>,
  referenceEnvironment: WorkflowReferenceEnvironment
): Record<string, unknown> {
  const reusable = targetWorkflow.reusable;
  if (!reusable) {
    throw new Error(`${node.title} can only invoke reusable workflows.`);
  }

  const templates = isRecord(node.config.inputTemplates)
    ? (node.config.inputTemplates as Record<string, unknown>)
    : {};
  const resolvedInputs: Record<string, unknown> = {};
  const passThroughInput = inputs.input;

  for (const input of reusable.inputs) {
    const template = templates[input.name];
    let resolved =
      template !== undefined
        ? resolveTemplateConfigValue(template, referenceEnvironment)
        : undefined;

    if (resolved === undefined && reusable.inputs.length === 1 && passThroughInput) {
      resolved = passThroughInput.value;
    }

    if (resolved === undefined || resolved === null || (typeof resolved === "string" && !resolved.trim())) {
      if (input.required !== false) {
        throw new Error(
          `${node.title} is missing required reusable input '${input.name}' for '${targetWorkflow.name}'.`
        );
      }
      continue;
    }

    resolvedInputs[input.name] = coerceRuntimeValue(
      resolved,
      input.valueType,
      `${targetWorkflow.name} input '${input.name}'`
    );
  }

  return resolvedInputs;
}

function resolveReusableWorkflowOutputs(
  workflow: WorkflowRecord,
  context: WorkflowRunContext,
  run: InternalWorkflowRunResult
): Record<string, unknown> {
  const reusable = workflow.reusable;
  if (!reusable) {
    return {};
  }

  const environment = buildReferenceEnvironment(context, {}, run.nodeOutputs);
  return Object.fromEntries(
    reusable.outputs.map((output) => {
      const resolved = resolveWorkflowTemplateValue(output.valueTemplate, environment);
      return [
        output.name,
        coerceRuntimeValue(resolved, output.valueType, `${workflow.name} output '${output.name}'`)
      ];
    })
  );
}

function tryParseHttpJson(text: string, contentType?: string | null): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const shouldTry =
    Boolean(contentType?.toLowerCase().includes("json")) ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!shouldTry) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function selectWorkflowResultCollection(value: unknown, path: unknown): unknown {
  if (typeof path === "string" && path.trim()) {
    return getPathValue(value, path);
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items;
  }

  return value;
}

function extendReferenceEnvironment(
  environment: WorkflowReferenceEnvironment,
  extraValues: Record<string, RuntimeValue>
): WorkflowReferenceEnvironment {
  return {
    ...environment,
    extraValues: {
      ...(environment.extraValues ?? {}),
      ...extraValues
    }
  };
}

function resolveTemplateObjectConfig(
  configValue: unknown,
  environment: WorkflowReferenceEnvironment,
  label: string
): unknown {
  if (configValue === undefined || configValue === null) {
    return undefined;
  }

  if (typeof configValue === "string") {
    const trimmed = configValue.trim();
    if (!trimmed) {
      return undefined;
    }

    const resolved = resolveWorkflowTemplateValue(configValue, environment);
    if (typeof resolved !== "string") {
      return resolved;
    }

    try {
      return JSON.parse(resolved);
    } catch (error) {
      throw new Error(
        `${label} must resolve to valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (Array.isArray(configValue)) {
    return configValue.map((entry) =>
      typeof entry === "string"
        ? resolveWorkflowTemplateValue(entry, environment)
        : resolveTemplateObjectConfig(entry, environment, label)
    );
  }

  if (typeof configValue === "object") {
    return Object.fromEntries(
      Object.entries(configValue as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === "string"
          ? resolveWorkflowTemplateValue(value, environment)
          : resolveTemplateObjectConfig(value, environment, label)
      ])
    );
  }

  return configValue;
}

function resolveTemplateConfigValue(
  value: unknown,
  environment: WorkflowReferenceEnvironment
): unknown {
  if (typeof value === "string") {
    const resolved = resolveWorkflowTemplateValue(value, environment);
    if (typeof resolved !== "string") {
      return resolved;
    }

    const trimmed = resolved.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return resolved;
      }
    }

    return resolved;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateConfigValue(entry, environment));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveTemplateConfigValue(entry, environment)
      ])
    );
  }

  return value;
}

function topologicalSort(workflow: WorkflowRecord): WorkflowRecord["nodes"] {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of workflow.edges) {
    if (!indegree.has(edge.toNodeId) || !indegree.has(edge.fromNodeId)) {
      continue;
    }
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
    outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge.toNodeId]);
  }

  const queue = workflow.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const ordered: WorkflowRecord["nodes"] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = nodeById.get(current);
    if (!node) {
      continue;
    }
    ordered.push(node);

    for (const next of outgoing.get(current) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
      }
    }
  }

  return ordered.length === workflow.nodes.length ? ordered : workflow.nodes;
}

function evaluateCondition(
  inputValue: unknown,
  compareValue: unknown,
  config: Record<string, unknown>
): boolean {
  const operator = String(config.operator ?? "contains");
  const caseSensitive = config.caseSensitive === true;
  const sourceText = toComparableString(inputValue, caseSensitive);
  const compareText = toComparableString(compareValue, caseSensitive);

  switch (operator) {
    case "equals":
      return sourceText === compareText;
    case "starts-with":
      return sourceText.startsWith(compareText);
    case "ends-with":
      return sourceText.endsWith(compareText);
    case "matches-regex":
      return new RegExp(String(compareValue ?? ""), String(config.flags ?? "")).test(
        stringifyWorkflowReferenceValue(inputValue)
      );
    case "truthy":
      return Boolean(inputValue);
    case "not-empty":
      return sourceText.trim().length > 0;
    case "is-empty":
      return sourceText.trim().length === 0;
    case "contains":
    default:
      return sourceText.includes(compareText);
  }
}

function buildReferenceEnvironment(
  context: WorkflowRunContext,
  inputs: Record<string, RuntimeValue>,
  nodeOutputs: Map<string, Record<string, RuntimeValue>>
): WorkflowReferenceEnvironment {
  return {
    context,
    inputs,
    nodeOutputs
  };
}

function readRuntimeTextInput(
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  inputName: string
): string {
  return stringifyValueForDisplay(readRuntimeValue(node, inputs, inputName, ["text"]));
}

function readOptionalRuntimeValueAsText(
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  inputName: string,
  acceptedTypes: WorkflowValueType[]
): string | undefined {
  const value = readOptionalRuntimeValue(node, inputs, inputName, acceptedTypes);
  return value ? stringifyValueForDisplay(value) : undefined;
}

function readOptionalRuntimeValue(
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  inputName: string,
  acceptedTypes: WorkflowValueType[]
): RuntimeValue | undefined {
  const value = inputs[inputName];
  if (!value) {
    return undefined;
  }
  assertRuntimeValueType(node, inputName, value, acceptedTypes);
  return value;
}

function readRuntimeValue(
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  inputName: string,
  acceptedTypes: WorkflowValueType[]
): RuntimeValue {
  const value = inputs[inputName];
  if (!value) {
    throw new Error(`${node.title} is missing input '${inputName}'.`);
  }
  assertRuntimeValueType(node, inputName, value, acceptedTypes);
  return value;
}

function readActionResult(
  node: WorkflowRecord["nodes"][number],
  inputs: Record<string, RuntimeValue>,
  inputName: string
): ActionResponse {
  const value = readRuntimeValue(node, inputs, inputName, ["action-result"]);
  return value.value as ActionResponse;
}

function assertRuntimeValueType(
  node: WorkflowRecord["nodes"][number],
  inputName: string,
  value: RuntimeValue,
  acceptedTypes: WorkflowValueType[]
) {
  if (!isCompatibleType(value.type, acceptedTypes)) {
    throw new Error(
      `${node.title} expected input '${inputName}' to be ${acceptedTypes.join(" or ")}, but received ${value.type}.`
    );
  }
}

function isCompatibleType(
  actualType: WorkflowValueType,
  acceptedTypes: WorkflowValueType[]
): boolean {
  if (acceptedTypes.includes(actualType)) {
    return true;
  }

  return (
    (actualType === "url" && acceptedTypes.includes("text")) ||
    (actualType === "text" && acceptedTypes.includes("url")) ||
    (actualType === "number" && acceptedTypes.includes("text")) ||
    (actualType === "http-response" && acceptedTypes.includes("object")) ||
    (actualType === "json" && acceptedTypes.includes("object")) ||
    (actualType === "object" && acceptedTypes.includes("json"))
  );
}

function createRuntimeValue(value: unknown, type: WorkflowValueType): RuntimeValue {
  return {
    type,
    value
  };
}

function coerceRuntimeValue(
  value: unknown,
  type: WorkflowValueType,
  label: string
): unknown {
  switch (type) {
    case "text":
    case "url":
    case "file":
      return stringifyWorkflowReferenceValue(value);
    case "number":
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
      throw new Error(`${label} expected a numeric value.`);
    case "boolean":
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") {
          return true;
        }
        if (normalized === "false" || normalized === "0" || normalized === "") {
          return false;
        }
      }
      return Boolean(value);
    case "object":
    case "json":
    case "http-response":
      if (typeof value === "string") {
        return parseJsonValue(value, label);
      }
      if (value && typeof value === "object") {
        return value;
      }
      throw new Error(`${label} expected a structured object value.`);
    case "file-list":
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry));
      }
      throw new Error(`${label} expected a file list.`);
    case "action-result":
      if (isActionResponseLike(value)) {
        return value;
      }
      throw new Error(`${label} expected an action result.`);
    case "result-list":
      if (Array.isArray(value)) {
        return value;
      }
      throw new Error(`${label} expected launcher results.`);
    case "void":
      return undefined;
  }
}

function parseJsonValue(input: string, label: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(
      `${label} could not parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function resolveConfigText(
  configValue: unknown,
  environment: WorkflowReferenceEnvironment
): string {
  if (typeof configValue !== "string") {
    return "";
  }

  return renderWorkflowTemplate(configValue, environment);
}

function toComparableString(value: unknown, caseSensitive: boolean): string {
  const normalized = stringifyWorkflowReferenceValue(value);
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function stringifyValueForDisplay(value: RuntimeValue): string {
  if (value.type === "action-result") {
    const response = value.value as ActionResponse;
    return response.message ?? (response.ok ? "Action completed." : "Action failed.");
  }

  if (value.type === "number") {
    return String(value.value);
  }

  if (value.type === "http-response") {
    const response = value.value as WorkflowHttpResponse;
    return `${response.status} ${response.ok ? "OK" : "error"} · ${(response.text ?? "").slice(0, 72)}`;
  }

  if (value.type === "object" || value.type === "json") {
    try {
      return JSON.stringify(value.value);
    } catch {
      return "[object]";
    }
  }

  if (value.type === "result-list" && Array.isArray(value.value)) {
    return `${value.value.length} launcher results`;
  }

  if (value.type === "file-list" && Array.isArray(value.value)) {
    return `${value.value.length} files`;
  }

  return stringifyWorkflowReferenceValue(value.value);
}

function getPathValue(value: unknown, path: string): unknown {
  if (!path.trim()) {
    return value;
  }

  return path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current === undefined || current === null) {
        return undefined;
      }
      if (Array.isArray(current)) {
        const index = Number.parseInt(segment, 10);
        return Number.isNaN(index) ? undefined : current[index];
      }
      if (typeof current === "object") {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, value);
}

function previewInputs(inputs: Record<string, RuntimeValue>): WorkflowLogValuePreview[] {
  return Object.entries(inputs).map(([key, value]) => ({
    type: value.type,
    summary: `${key}: ${previewString(value)}`
  }));
}

function previewOutputs(outputs: Record<string, RuntimeValue>): WorkflowLogValuePreview | undefined {
  const entries = Object.entries(outputs);
  if (entries.length === 0) {
    return undefined;
  }

  return {
    type: entries[0]![1].type,
    summary: entries
      .map(([port, value]) => `${port}: ${previewString(value)}`)
      .join(" | ")
      .slice(0, 220)
  };
}

function previewString(value: RuntimeValue): string {
  const rendered = stringifyValueForDisplay(value);
  return rendered.slice(0, 120);
}

function createLogEntry(
  node: WorkflowRecord["nodes"][number],
  startedAt: number,
  status: WorkflowExecutionLog["status"],
  extras: {
    inputPreview?: WorkflowLogValuePreview[];
    outputPreview?: WorkflowLogValuePreview;
    nestedLogs?: WorkflowExecutionLog[];
    error?: string;
  }
): WorkflowExecutionLog {
  const finishedAt = Date.now();
  return {
    nodeId: node.id,
    nodeType: node.type,
    title: node.title,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    status,
    inputPreview: extras.inputPreview,
    outputPreview: extras.outputPreview,
    nestedLogs: extras.nestedLogs,
    error: extras.error
  };
}

function normalizeValueType(value: unknown): WorkflowValueType | undefined {
  switch (value) {
    case "text":
    case "url":
    case "number":
    case "boolean":
    case "object":
    case "http-response":
    case "json":
    case "file":
    case "file-list":
    case "action-result":
    case "result-list":
    case "void":
      return value;
    default:
      return undefined;
  }
}

function inferRuntimeValueType(value: unknown): WorkflowValueType {
  if (typeof value === "string") {
    return "text";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (Array.isArray(value)) {
    return "object";
  }
  if (isActionResponseLike(value)) {
    return "action-result";
  }
  if (value && typeof value === "object") {
    return "object";
  }
  return "text";
}

function isActionResponseLike(value: unknown): value is ActionResponse {
  return (
    !!value &&
    typeof value === "object" &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean"
  );
}

function actionResultValue(response: ActionResponse): RuntimeValue {
  return {
    type: "action-result",
    value: response
  };
}

function textValue(value: string): RuntimeValue {
  return {
    type: "text",
    value
  };
}

function optionalRenderedText(
  configValue: unknown,
  environment: WorkflowReferenceEnvironment
): string | undefined {
  if (typeof configValue !== "string" || !configValue.trim()) {
    return undefined;
  }

  const rendered = renderWorkflowTemplate(configValue, environment).trim();
  return rendered.length > 0 ? rendered : undefined;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeScore(value: unknown): number {
  const parsed = normalizePositiveNumber(value);
  if (!parsed) {
    return 0.92;
  }
  return Math.min(parsed, 5);
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .map(([key, entry]) => [key, stringifyWorkflowReferenceValue(entry)])
  );
}

function normalizeResultItemType(value: unknown): ResultItemType | undefined {
  switch (value) {
    case "app":
    case "file":
    case "folder":
    case "url":
    case "command":
    case "clipboard":
    case "snippet":
    case "plugin":
    case "workflow":
    case "system":
      return value;
    default:
      return undefined;
  }
}

function normalizeResultSource(value: unknown): ResultSource | undefined {
  switch (value) {
    case "apps":
    case "files":
    case "web":
    case "clipboard":
    case "snippets":
    case "plugins":
    case "workflows":
    case "system":
      return value;
    default:
      return undefined;
  }
}

function deriveResultTypeFromAction(kind: ActionItem["kind"]): ResultItemType {
  switch (kind) {
    case "open-url":
    case "search-web":
      return "url";
    case "open-path":
    case "reveal-in-folder":
    case "copy-path":
    case "open-in-terminal":
      return "file";
    case "launch-app":
      return "app";
    case "show-settings":
      return "system";
    case "run-workflow":
      return "workflow";
    default:
      return "command";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function configValueForInput(config: Record<string, unknown>, inputName: string): unknown {
  const direct = config[inputName];
  if (direct !== undefined && direct !== null) {
    return direct;
  }

  switch (inputName) {
    case "text":
      return config.textTemplate ?? config.template;
    case "url":
      return config.urlTemplate ?? config.template;
    case "path":
      return config.pathTemplate;
    case "command":
      return config.commandTemplate;
    case "query":
      return config.queryTemplate;
    case "items":
      return config.itemsTemplate;
    default:
      return undefined;
  }
}

export function isWorkflowExecutable(
  workflow: WorkflowRecord
): { ok: boolean; issues: WorkflowValidationIssue[] } {
  const issues = validateWorkflow(workflow);
  return {
    ok: !issues.some((issue) => issue.level === "error"),
    issues
  };
}
