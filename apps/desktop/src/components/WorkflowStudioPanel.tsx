import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";

import {
  getWorkflowKeywordTrigger,
  getWorkflowTriggerExampleInvocation,
  getWorkflowTriggerDisplayLabel,
  getWorkflowSlashCommand,
  validateWorkflow
} from "@pulse/core";
import type {
  ActionKind,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeStatus,
  WorkflowNodeType,
  WorkflowRecord,
  WorkflowReusableDefinition,
  WorkflowReusableInputDefinition,
  WorkflowReusableOutputDefinition,
  WorkflowRunResult,
  WorkflowTrigger,
  WorkflowValidationIssue,
  WorkflowValueType
} from "@pulse/shared-types";

import {
  WORKFLOW_NODE_LIBRARY,
  WORKFLOW_NODE_LIBRARY_BY_TYPE,
  cloneWorkflow,
  createEdgeDraft,
  createNodeDraft,
  createWorkflowDraft,
  sortWorkflowNodes
} from "../features/workflows/editor";

interface WorkflowStudioPanelProps {
  workflows: WorkflowRecord[];
  workflowRuns: Record<string, WorkflowRunResult[]>;
  snippets: number;
  plugins: number;
  indexedFiles: number;
  onBack(): void;
  onSaveWorkflow(workflow: WorkflowRecord): Promise<WorkflowRecord>;
  onDeleteWorkflow(id: string): Promise<void>;
  onDuplicateWorkflow(workflow: WorkflowRecord): Promise<WorkflowRecord>;
  onRunWorkflow(workflow: WorkflowRecord, rawInput: string): Promise<WorkflowRunResult>;
}

const SHARED_ACTION_KINDS: ActionKind[] = [
  "copy-text",
  "open-url",
  "open-path",
  "search-web",
  "paste-text",
  "rebuild-file-index"
];

const WORKFLOW_RESULT_ACTION_KINDS: ActionKind[] = [
  "open-url",
  "open-path",
  "copy-text",
  "search-web",
  "show-settings",
  "noop"
];

const REUSABLE_VALUE_TYPES: WorkflowValueType[] = [
  "text",
  "url",
  "number",
  "boolean",
  "object",
  "http-response",
  "action-result",
  "result-list"
];

export function WorkflowStudioPanel({
  workflows,
  workflowRuns,
  snippets,
  plugins,
  indexedFiles,
  onBack,
  onSaveWorkflow,
  onDeleteWorkflow,
  onDuplicateWorkflow,
  onRunWorkflow
}: WorkflowStudioPanelProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    workflows[0]?.id ?? null
  );
  const [draft, setDraft] = useState<WorkflowRecord | null>(
    workflows[0] ? cloneWorkflow(workflows[0]) : createWorkflowDraft()
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    workflows[0]?.nodes[0]?.id ?? null
  );
  const [runInput, setRunInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (draft) {
      return;
    }

    if (workflows[0]) {
      loadWorkflow(workflows[0]);
      return;
    }

    const created = createWorkflowDraft();
    setDraft(created);
    setSelectedWorkflowId(created.id);
    setSelectedNodeId(created.nodes[0]?.id ?? null);
  }, [draft, workflows]);

  useEffect(() => {
    if (!selectedWorkflowId) {
      return;
    }

    if (draft?.id === selectedWorkflowId) {
      return;
    }

    const nextWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId);
    if (nextWorkflow) {
      loadWorkflow(nextWorkflow);
    }
  }, [draft?.id, selectedWorkflowId, workflows]);

  const selectedWorkflow =
    draft ??
    (selectedWorkflowId
      ? workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null
      : null);
  const selectedNode =
    selectedWorkflow?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const orderedNodes = selectedWorkflow ? sortWorkflowNodes(selectedWorkflow) : [];
  const validationIssues = selectedWorkflow
    ? validateWorkflow(selectedWorkflow, { workflowCatalog: workflows })
    : [];
  const blockingIssues = validationIssues.filter((issue) => issue.level === "error");
  const latestRun = selectedWorkflow ? workflowRuns[selectedWorkflow.id]?.[0] : undefined;
  const builtIns = workflows.filter((workflow) => workflow.builtIn);
  const customWorkflows = workflows.filter((workflow) => !workflow.builtIn);

  function loadWorkflow(workflow: WorkflowRecord) {
    const cloned = cloneWorkflow(workflow);
    setDraft(cloned);
    setSelectedWorkflowId(cloned.id);
    setSelectedNodeId(cloned.nodes[0]?.id ?? null);
    setDirty(false);
    setRunInput("");
    setLocalNotice(null);
  }

  function updateDraft(nextWorkflow: WorkflowRecord) {
    setDraft({
      ...nextWorkflow,
      updatedAt: Date.now()
    });
    setDirty(true);
    setLocalNotice(null);
  }

  function createNewWorkflow() {
    const created = createWorkflowDraft();
    setDraft(created);
    setSelectedWorkflowId(created.id);
    setSelectedNodeId(created.nodes[0]?.id ?? null);
    setRunInput("");
    setDirty(true);
    setLocalNotice("New workflow draft created. Save to add it to launcher discovery.");
  }

  async function saveDraft() {
    if (!selectedWorkflow || selectedWorkflow.builtIn) {
      return;
    }

    setSaving(true);
    setBusyMessage("Saving workflow...");
    try {
      const saved = await onSaveWorkflow(selectedWorkflow);
      loadWorkflow(saved);
      setLocalNotice("Workflow saved.");
    } catch {
      setLocalNotice("Workflow save failed. Review the launcher error banner for details.");
    } finally {
      setSaving(false);
      setBusyMessage(null);
    }
  }

  async function duplicateDraft() {
    if (!selectedWorkflow) {
      return;
    }

    setSaving(true);
    setBusyMessage("Duplicating workflow...");
    try {
      const duplicated = await onDuplicateWorkflow(selectedWorkflow);
      loadWorkflow(duplicated);
      setLocalNotice("Workflow duplicated. Edit the new copy freely.");
    } catch {
      setLocalNotice("Workflow duplication failed. Review the launcher error banner for details.");
    } finally {
      setSaving(false);
      setBusyMessage(null);
    }
  }

  async function deleteDraft() {
    if (!selectedWorkflow || selectedWorkflow.builtIn) {
      return;
    }

    setSaving(true);
    setBusyMessage("Deleting workflow...");
    try {
      await onDeleteWorkflow(selectedWorkflow.id);
      const fallback = workflows.find((workflow) => workflow.id !== selectedWorkflow.id);
      if (fallback) {
        loadWorkflow(fallback);
      } else {
        createNewWorkflow();
      }
    } catch {
      setLocalNotice("Workflow deletion failed. Review the launcher error banner for details.");
    } finally {
      setSaving(false);
      setBusyMessage(null);
    }
  }

  async function runDraft() {
    if (!selectedWorkflow) {
      return;
    }

    setRunning(true);
    setBusyMessage("Running workflow...");
    try {
      await onRunWorkflow(selectedWorkflow, buildWorkflowInvocation(selectedWorkflow, runInput));
      setLocalNotice("Workflow run finished. See the debug panel for per-node logs.");
    } catch {
      setLocalNotice("Workflow run failed. Review logs and the launcher error banner.");
    } finally {
      setRunning(false);
      setBusyMessage(null);
    }
  }

  function updateWorkflowFields(patch: Partial<WorkflowRecord>) {
    if (!selectedWorkflow) {
      return;
    }
    updateDraft({
      ...selectedWorkflow,
      ...patch
    });
  }

  function updateTrigger(nextTrigger: WorkflowTrigger) {
    if (!selectedWorkflow) {
      return;
    }
    updateWorkflowFields({
      trigger: nextTrigger
    });
  }

  function updateNode(nodeId: string, patch: Partial<WorkflowNode>) {
    if (!selectedWorkflow) {
      return;
    }

    updateDraft({
      ...selectedWorkflow,
      nodes: selectedWorkflow.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              ...patch
            }
          : node
      )
    });
  }

  function updateNodeConfig(nodeId: string, patch: Record<string, unknown>) {
    const node = selectedWorkflow?.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return;
    }

    updateNode(nodeId, {
      config: {
        ...node.config,
        ...patch
      }
    });
  }

  function addNode(type: WorkflowNodeType) {
    if (!selectedWorkflow) {
      return;
    }

    const nextNode = createNodeDraft(type);
    const previousNode =
      (selectedNodeId
        ? selectedWorkflow.nodes.find((node) => node.id === selectedNodeId)
        : undefined) ?? orderedNodes.at(-1);
    const nextEdges = [...selectedWorkflow.edges];

    if (previousNode && WORKFLOW_NODE_LIBRARY_BY_TYPE[type].inputs.length > 0) {
      const currentOutgoing = nextEdges.filter((edge) => edge.fromNodeId === previousNode.id);
      if (
        previousNode.type === "conditional-branch"
          ? currentOutgoing.length < 2
          : currentOutgoing.length === 0
      ) {
        const nextEdge = createEdgeDraft(selectedWorkflow, previousNode.id, nextNode.id);
        if (previousNode.type === "conditional-branch") {
          nextEdge.fromPort =
            currentOutgoing.some((edge) => edge.fromPort === "true") ? "false" : "true";
        }
        nextEdges.push(nextEdge);
      }
    }

    updateDraft({
      ...selectedWorkflow,
      nodes: [...selectedWorkflow.nodes, nextNode],
      edges: nextEdges
    });
    setSelectedNodeId(nextNode.id);
  }

  function removeNode(nodeId: string) {
    if (!selectedWorkflow) {
      return;
    }

    const remainingNodes = selectedWorkflow.nodes.filter((node) => node.id !== nodeId);
    const remainingEdges = selectedWorkflow.edges.filter(
      (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
    );

    updateDraft({
      ...selectedWorkflow,
      nodes: remainingNodes,
      edges: remainingEdges
    });
    setSelectedNodeId(remainingNodes[0]?.id ?? null);
  }

  function addEdge() {
    if (!selectedWorkflow || selectedWorkflow.nodes.length < 2) {
      return;
    }

    const fromNode = selectedNode ?? orderedNodes[0];
    const toNode = orderedNodes.find((node) => node.id !== fromNode.id) ?? orderedNodes[1];
    if (!fromNode || !toNode) {
      return;
    }

    updateDraft({
      ...selectedWorkflow,
      edges: [...selectedWorkflow.edges, createEdgeDraft(selectedWorkflow, fromNode.id, toNode.id)]
    });
  }

  function updateEdge(edgeId: string, patch: Partial<WorkflowEdge>) {
    if (!selectedWorkflow) {
      return;
    }

    updateDraft({
      ...selectedWorkflow,
      edges: selectedWorkflow.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              ...patch
            }
          : edge
      )
    });
  }

  function removeEdge(edgeId: string) {
    if (!selectedWorkflow) {
      return;
    }

    updateDraft({
      ...selectedWorkflow,
      edges: selectedWorkflow.edges.filter((edge) => edge.id !== edgeId)
    });
  }

  return (
    <section className="shell-panel rounded-[28px] p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--shell-border)] pb-4">
        <div>
          <div className="shell-kicker">Workflow Studio</div>
          <h2 className="mt-2 text-[1.95rem] font-semibold tracking-[-0.03em] text-[color:var(--shell-text-primary)]">
            Custom slash commands and composable actions
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--shell-text-secondary)]">
            Runtime v1 supports acyclic flows, simple branches, typed node ports, reusable
            subflows, shared action reuse, and plugin command routing. Loops, concurrency, and
            free-form graph editing stay deferred.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClassName} onClick={onBack}>
            Back
          </button>
          <button type="button" className={secondaryButtonClassName} onClick={createNewWorkflow}>
            New workflow
          </button>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => {
              if (selectedWorkflow) {
                void duplicateDraft();
              }
            }}
            disabled={!selectedWorkflow || saving}
          >
            Duplicate
          </button>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => {
              if (selectedWorkflow && !selectedWorkflow.builtIn) {
                void deleteDraft();
              }
            }}
            disabled={!selectedWorkflow || selectedWorkflow?.builtIn || saving}
          >
            Delete
          </button>
          <button
            type="button"
            className={primaryButtonClassName}
            onClick={() => {
              void saveDraft();
            }}
            disabled={!selectedWorkflow || selectedWorkflow?.builtIn || saving}
          >
            {saving ? "Saving..." : selectedWorkflow?.builtIn ? "Built-in" : "Save"}
          </button>
          <button
            type="button"
            className={primaryButtonClassName}
            onClick={() => {
              void runDraft();
            }}
            disabled={!selectedWorkflow || running || blockingIssues.length > 0}
          >
            {running ? "Running..." : "Run"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="space-y-4">
          <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
            <div className="shell-kicker">Workflows</div>
            <div className="mt-3 space-y-4">
              <WorkflowGroup
                title="Built-in"
                workflows={builtIns}
                selectedWorkflowId={selectedWorkflow?.id ?? null}
                onSelect={loadWorkflow}
              />
              <WorkflowGroup
                title="Custom"
                workflows={customWorkflows}
                selectedWorkflowId={selectedWorkflow?.id ?? null}
                onSelect={loadWorkflow}
                emptyLabel="No saved custom workflows yet."
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
            <div className="shell-kicker">Node Library</div>
            <div className="mt-3 space-y-4">
              {["input", "transform", "action", "output"].map((category) => {
                const nodes = WORKFLOW_NODE_LIBRARY.filter((node) => node.category === category);
                return (
                  <div key={category} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--shell-text-tertiary)]">
                      {category}
                    </div>
                    <div className="space-y-2">
                      {nodes.map((node) => (
                        <button
                          key={node.type}
                          type="button"
                          className="w-full rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-3 py-2 text-left transition hover:border-[color:var(--shell-border-strong)]"
                          onClick={() => addNode(node.type)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-[color:var(--shell-text-primary)]">
                              {node.label}
                            </div>
                            <StatusBadge status={node.status} />
                          </div>
                          <div className="mt-1 text-xs leading-5 text-[color:var(--shell-text-secondary)]">
                            {node.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          {selectedWorkflow ? (
            <>
              <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="shell-kicker">Selected Workflow</div>
                    <h3 className="mt-2 text-2xl font-semibold text-[color:var(--shell-text-primary)]">
                      {selectedWorkflow.name}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--shell-text-secondary)]">
                      {selectedWorkflow.description ?? "Add a short description for launcher discovery and demos."}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <MetricChip
                      title="Trigger"
                      value={selectedWorkflow.trigger.label}
                      note={
                        selectedWorkflow.trigger.type === "slash-command"
                          ? "Discoverable in launcher search and slash command parsing."
                          : "Scaffold trigger type. Manual run works now; deeper integration is planned."
                      }
                    />
                    <MetricChip
                      title="Nodes"
                      value={String(selectedWorkflow.nodes.length)}
                      note={`${selectedWorkflow.edges.length} edges, ${blockingIssues.length} blocking issue(s)`}
                    />
                    <MetricChip
                      title="Runtime"
                      value={latestRun ? (latestRun.ok ? "Healthy" : "Needs attention") : "Unrun"}
                      note={latestRun ? formatTimestamp(latestRun.logs[0]?.startedAt) : "Run from this surface to inspect per-node logs."}
                    />
                    <MetricChip
                      title="Inputs"
                      value={`${indexedFiles} files / ${snippets} snippets / ${plugins} plugins`}
                      note="Runtime can already consume launcher query, clipboard text, shared actions, and plugin commands."
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-[20px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4">
                    <div className="shell-kicker">Test Invocation</div>
                    <div className="mt-2 text-sm text-[color:var(--shell-text-secondary)]">
                      {getInvocationHint(selectedWorkflow)}
                    </div>
                    <input
                      value={runInput}
                      onChange={(event) => setRunInput(event.target.value)}
                      className={`${inputClassName} mt-3`}
                      placeholder={getRunInputPlaceholder(selectedWorkflow)}
                    />
                    <div className="mt-3 text-xs leading-5 text-[color:var(--shell-text-tertiary)]">
                      {buildWorkflowInvocation(selectedWorkflow, runInput)}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4">
                    <div className="shell-kicker">Status</div>
                    <div className="mt-3 space-y-2 text-sm text-[color:var(--shell-text-secondary)]">
                      {selectedWorkflow.builtIn ? (
                        <p>
                          This is a built-in demo workflow. Duplicate it to customize nodes,
                          trigger shape, or copied actions.
                        </p>
                      ) : dirty ? (
                        <p>Unsaved edits are only stored in this editor until you save.</p>
                      ) : (
                        <p>Saved workflow definition matches the last persisted draft.</p>
                      )}
                      {localNotice ? <p>{localNotice}</p> : null}
                      {busyMessage ? <p>{busyMessage}</p> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="shell-kicker">Flow Editor</div>
                        <div className="mt-2 text-sm text-[color:var(--shell-text-secondary)]">
                          Runtime v1 executes a simplified DAG. Use this ordered canvas to compose linear flows and explicit small branches.
                        </div>
                      </div>
                      <button type="button" className={secondaryButtonClassName} onClick={addEdge}>
                        Add edge
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {orderedNodes.length === 0 ? (
                        <EmptyPanel
                          title="No nodes yet"
                          detail="Add an input node and at least one output node to make the workflow executable."
                        />
                      ) : (
                        orderedNodes.map((node, index) => {
                          const definition = WORKFLOW_NODE_LIBRARY_BY_TYPE[node.type];
                          const inbound = selectedWorkflow.edges.filter(
                            (edge) => edge.toNodeId === node.id
                          );
                          const outbound = selectedWorkflow.edges.filter(
                            (edge) => edge.fromNodeId === node.id
                          );

                          return (
                            <div key={node.id} className="space-y-2">
                              <button
                                type="button"
                                className={clsx(
                                  "w-full rounded-[22px] border px-4 py-4 text-left transition",
                                  node.id === selectedNodeId
                                    ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)]"
                                    : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] hover:border-[color:var(--shell-border-strong)]"
                                )}
                                onClick={() => setSelectedNodeId(node.id)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
                                        {index + 1}
                                      </span>
                                      <span className="text-lg font-semibold text-[color:var(--shell-text-primary)]">
                                        {node.title}
                                      </span>
                                      <StatusBadge status={node.status} />
                                    </div>
                                    <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
                                      {node.description ?? definition.description}
                                    </div>
                                  </div>
                                  <div className="rounded-full border border-[color:var(--shell-border)] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
                                    {definition.category}
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  <PortList
                                    title="Inputs"
                                    ports={definition.inputs.map((port) => ({
                                      name: port.name,
                                      valueType: port.valueType,
                                      acceptedValueTypes: port.acceptedValueTypes,
                                      required: port.required
                                    }))}
                                    emptyLabel="No incoming inputs"
                                  />
                                  <PortList
                                    title="Outputs"
                                    ports={definition.outputs.map((port) => ({
                                      name: port.name,
                                      valueType: port.valueType
                                    }))}
                                    emptyLabel="No outputs"
                                  />
                                </div>

                                <div className="mt-4 grid gap-2 md:grid-cols-2">
                                  <ConnectionSummary label="Inbound" edges={inbound} />
                                  <ConnectionSummary label="Outbound" edges={outbound} />
                                </div>
                              </button>

                              {index < orderedNodes.length - 1 ? (
                                <div className="flex justify-center text-xs uppercase tracking-[0.24em] text-[color:var(--shell-text-tertiary)]">
                                  continue
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="shell-kicker">Edges</div>
                        <div className="mt-2 text-sm text-[color:var(--shell-text-secondary)]">
                          Runtime v1 only supports explicit DAG edges. Non-branch nodes may keep one outgoing edge; Conditional Branch may route true and false separately.
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {selectedWorkflow.edges.length === 0 ? (
                        <EmptyPanel
                          title="No edges yet"
                          detail="Add at least one connection so data can move between nodes."
                        />
                      ) : (
                        selectedWorkflow.edges.map((edge) => {
                          const fromNode = selectedWorkflow.nodes.find(
                            (node) => node.id === edge.fromNodeId
                          );
                          const toNode = selectedWorkflow.nodes.find(
                            (node) => node.id === edge.toNodeId
                          );
                          const fromOutputs = fromNode
                            ? WORKFLOW_NODE_LIBRARY_BY_TYPE[fromNode.type].outputs
                            : [];
                          const toInputs = toNode
                            ? WORKFLOW_NODE_LIBRARY_BY_TYPE[toNode.type].inputs
                            : [];

                          return (
                            <div
                              key={edge.id}
                              className="rounded-[20px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4"
                            >
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_120px_auto]">
                                <select
                                  value={edge.fromNodeId}
                                  onChange={(event) =>
                                    updateEdge(edge.id, {
                                      fromNodeId: event.target.value
                                    })
                                  }
                                  className={selectClassName}
                                >
                                  {selectedWorkflow.nodes.map((node) => (
                                    <option key={node.id} value={node.id}>
                                      {node.title}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={edge.fromPort}
                                  onChange={(event) =>
                                    updateEdge(edge.id, {
                                      fromPort: event.target.value
                                    })
                                  }
                                  className={selectClassName}
                                >
                                  {fromOutputs.map((port) => (
                                    <option key={port.name} value={port.name}>
                                      {port.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={edge.toNodeId}
                                  onChange={(event) =>
                                    updateEdge(edge.id, {
                                      toNodeId: event.target.value
                                    })
                                  }
                                  className={selectClassName}
                                >
                                  {selectedWorkflow.nodes.map((node) => (
                                    <option key={node.id} value={node.id}>
                                      {node.title}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={edge.toInput}
                                  onChange={(event) =>
                                    updateEdge(edge.id, {
                                      toInput: event.target.value
                                    })
                                  }
                                  className={selectClassName}
                                >
                                  {toInputs.map((port) => (
                                    <option key={port.name} value={port.name}>
                                      {port.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className={secondaryButtonClassName}
                                  onClick={() => removeEdge(edge.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
                    <div className="shell-kicker">Inspector</div>
                    <div className="mt-3 space-y-4">
                      <WorkflowInspector
                        workflow={selectedWorkflow}
                        workflows={workflows}
                        selectedNode={selectedNode}
                        onWorkflowChange={updateWorkflowFields}
                        onTriggerChange={updateTrigger}
                        onNodeChange={updateNode}
                        onNodeConfigChange={updateNodeConfig}
                        onDeleteNode={removeNode}
                      />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
                    <div className="shell-kicker">Validation</div>
                    <div className="mt-3 space-y-2">
                      {validationIssues.length === 0 ? (
                        <EmptyPanel
                          title="Ready to run"
                          detail="This workflow passes runtime v1 validation."
                        />
                      ) : (
                        validationIssues.map((issue, index) => (
                          <IssueCard key={`${issue.nodeId ?? "workflow"}:${index}`} issue={issue} />
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4">
                    <div className="shell-kicker">Debug Runs</div>
                    <div className="mt-3 space-y-3">
                      {(workflowRuns[selectedWorkflow.id] ?? []).length === 0 ? (
                        <EmptyPanel
                          title="No runs yet"
                          detail="Run the workflow from this surface or from launcher search to capture per-node execution logs."
                        />
                      ) : (
                        (workflowRuns[selectedWorkflow.id] ?? []).map((run, index) => (
                          <RunCard key={`${run.workflowId}:${index}`} run={run} />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EmptyPanel
              title="Workflow Studio is empty"
              detail="Create a workflow draft to start wiring slash commands and shared actions together."
            />
          )}
        </div>
      </div>
    </section>
  );
}

function WorkflowGroup({
  title,
  workflows,
  selectedWorkflowId,
  onSelect,
  emptyLabel
}: {
  title: string;
  workflows: WorkflowRecord[];
  selectedWorkflowId: string | null;
  onSelect(workflow: WorkflowRecord): void;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--shell-text-tertiary)]">
        {title}
      </div>
      {workflows.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[color:var(--shell-border)] px-3 py-3 text-sm text-[color:var(--shell-text-tertiary)]">
          {emptyLabel ?? "Nothing here yet."}
        </div>
      ) : (
        workflows.map((workflow) => (
          <button
            key={workflow.id}
            type="button"
            className={clsx(
              "w-full rounded-[18px] border px-3 py-3 text-left transition",
              workflow.id === selectedWorkflowId
                ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)]"
                : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] hover:border-[color:var(--shell-border-strong)]"
            )}
            onClick={() => onSelect(workflow)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-[color:var(--shell-text-primary)]">
                  {workflow.name}
                </div>
                <StatusPill label={getWorkflowTriggerRoleLabel(workflow)} />
                {workflow.reusable ? <StatusPill label="Reusable" /> : null}
              </div>
              {workflow.enabled ? <StatusPill label="Enabled" /> : <StatusPill label="Disabled" />}
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--shell-text-secondary)]">
              {getWorkflowTriggerSummary(workflow)}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function WorkflowInspector({
  workflow,
  workflows,
  selectedNode,
  onWorkflowChange,
  onTriggerChange,
  onNodeChange,
  onNodeConfigChange,
  onDeleteNode
}: {
  workflow: WorkflowRecord;
  workflows: WorkflowRecord[];
  selectedNode: WorkflowNode | null;
  onWorkflowChange(patch: Partial<WorkflowRecord>): void;
  onTriggerChange(trigger: WorkflowTrigger): void;
  onNodeChange(nodeId: string, patch: Partial<WorkflowNode>): void;
  onNodeConfigChange(nodeId: string, patch: Record<string, unknown>): void;
  onDeleteNode(nodeId: string): void;
}) {
  return selectedNode ? (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-[color:var(--shell-text-primary)]">
            {selectedNode.title}
          </div>
          <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
            {WORKFLOW_NODE_LIBRARY_BY_TYPE[selectedNode.type].description}
          </div>
        </div>
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={() => onDeleteNode(selectedNode.id)}
        >
          Delete node
        </button>
      </div>

      <Field label="Node title">
        <input
          value={selectedNode.title}
          onChange={(event) =>
            onNodeChange(selectedNode.id, {
              title: event.target.value
            })
          }
          className={inputClassName}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={selectedNode.description ?? ""}
          onChange={(event) =>
            onNodeChange(selectedNode.id, {
              description: event.target.value
            })
          }
          rows={3}
          className={textareaClassName}
        />
      </Field>

      <NodeConfigEditor
        workflow={workflow}
        workflows={workflows}
        node={selectedNode}
        onChange={onNodeConfigChange}
      />
    </>
  ) : (
    <>
      <div>
        <div className="text-lg font-semibold text-[color:var(--shell-text-primary)]">
          Workflow metadata
        </div>
        <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
          Configure launcher discovery, trigger behavior, and the saved identity for this workflow.
        </div>
      </div>

      <Field label="Name">
        <input
          value={workflow.name}
          onChange={(event) =>
            onWorkflowChange({
              name: event.target.value
            })
          }
          className={inputClassName}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={workflow.description ?? ""}
          onChange={(event) =>
            onWorkflowChange({
              description: event.target.value
            })
          }
          rows={4}
          className={textareaClassName}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Trigger type">
          <select
            value={workflow.trigger.type}
            onChange={(event) =>
              onTriggerChange(createTriggerDraft(event.target.value as WorkflowTrigger["type"], workflow.trigger))
            }
            className={selectClassName}
          >
            <option value="slash-command">Slash command</option>
            <option value="manual">Manual</option>
            <option value="keyword">Keyword</option>
            <option value="hotkey">Hotkey scaffold</option>
          </select>
        </Field>

        <Field label="Enabled">
          <select
            value={workflow.enabled ? "enabled" : "disabled"}
            onChange={(event) =>
              onWorkflowChange({
                enabled: event.target.value === "enabled"
              })
            }
            className={selectClassName}
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </Field>
      </div>

      <TriggerFields trigger={workflow.trigger} onChange={onTriggerChange} />

      <Field label="Tags">
        <input
          value={workflow.tags.join(", ")}
          onChange={(event) =>
            onWorkflowChange({
              tags: event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            })
          }
          className={inputClassName}
          placeholder="slash-command, demo, clipboard"
        />
      </Field>

      <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[color:var(--shell-text-primary)]">
              Reusable workflow
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--shell-text-secondary)]">
              Mark this workflow as an invokable subflow with explicit inputs and outputs.
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[color:var(--shell-text-secondary)]">
            <input
              type="checkbox"
              checked={Boolean(workflow.reusable)}
              onChange={(event) =>
                onWorkflowChange({
                  reusable: event.target.checked
                    ? {
                        description: workflow.description ?? "",
                        inputs: [
                          {
                            name: "query",
                            valueType: "text",
                            required: true,
                            description: ""
                          }
                        ],
                        outputs: [
                          {
                            name: "result",
                            valueType: "text",
                            description: "",
                            valueTemplate: "{{args.query}}"
                          }
                        ]
                      }
                    : null
                })
              }
            />
            Reusable
          </label>
        </div>

        {workflow.reusable ? (
          <div className="mt-4 space-y-4">
            <Field label="Reusable description">
              <textarea
                value={workflow.reusable.description ?? ""}
                onChange={(event) =>
                  onWorkflowChange({
                    reusable: {
                      ...workflow.reusable!,
                      description: event.target.value
                    }
                  })
                }
                rows={3}
                className={textareaClassName}
              />
            </Field>

            <ReusableContractEditor
              reusable={workflow.reusable}
              onChange={(reusable) =>
                onWorkflowChange({
                  reusable
                })
              }
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3 text-sm text-[color:var(--shell-text-secondary)]">
        Select a node in the canvas to edit node-level configuration such as templates, regex rules, shared actions, or plugin command routing.
      </div>
      <ConfigNote>
        Reference syntax is shared across templates and string config fields: <code>{"{{args.query}}"}</code>, <code>{"{{context.clipboard}}"}</code>, <code>{"{{inputs.input}}"}</code>, <code>{"{{nodes.parse.default.user.name}}"}</code>. Filters supported now: <code>trim</code>, <code>lower</code>, <code>upper</code>, <code>urlencode</code>, <code>json</code>, <code>prettyjson</code>.
      </ConfigNote>
    </>
  );
}

function TriggerFields({
  trigger,
  onChange
}: {
  trigger: WorkflowTrigger;
  onChange(trigger: WorkflowTrigger): void;
}) {
  switch (trigger.type) {
    case "slash-command":
      return (
        <>
          <Field label="Slash command">
            <input
              value={trigger.command}
              onChange={(event) =>
                onChange({
                  ...trigger,
                  command: event.target.value,
                  label: event.target.value
                })
              }
              className={inputClassName}
              placeholder="/google"
            />
          </Field>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Argument name">
              <input
                value={trigger.argumentName ?? ""}
                onChange={(event) =>
                  onChange({
                    ...trigger,
                    argumentName: event.target.value
                  })
                }
                className={inputClassName}
                placeholder="query"
              />
            </Field>
            <Field label="Placeholder">
              <input
                value={trigger.placeholder ?? ""}
                onChange={(event) =>
                  onChange({
                    ...trigger,
                    placeholder: event.target.value
                  })
                }
                className={inputClassName}
                placeholder="Search query"
              />
            </Field>
          </div>
        </>
      );
    case "keyword":
      return (
        <>
          <Field label="Keyword">
            <input
              value={trigger.keyword}
              onChange={(event) =>
                onChange({
                  ...trigger,
                  keyword: event.target.value,
                  label: event.target.value
                })
              }
              className={inputClassName}
              placeholder="jira"
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Argument name">
              <input
                value={trigger.argumentName ?? ""}
                onChange={(event) =>
                  onChange({
                    ...trigger,
                    argumentName: event.target.value
                  })
                }
                className={inputClassName}
                placeholder="query"
              />
            </Field>
            <Field label="Placeholder">
              <input
                value={trigger.placeholder ?? ""}
                onChange={(event) =>
                  onChange({
                    ...trigger,
                    placeholder: event.target.value
                  })
                }
                className={inputClassName}
                placeholder="Repository query"
              />
            </Field>
          </div>
          <Field label="Aliases">
            <input
              value={(trigger.aliases ?? []).join(", ")}
              onChange={(event) =>
                onChange({
                  ...trigger,
                  aliases: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                })
              }
              className={inputClassName}
              placeholder="github, repo"
            />
          </Field>
          <ConfigNote>
            Keyword triggers run from launcher input such as <code>{trigger.keyword || "jira"}</code>{" "}
            <code>{"ABC-123"}</code>. The first token selects the workflow and the
            remaining text becomes the primary argument payload.
          </ConfigNote>
        </>
      );
    case "hotkey":
      return (
        <Field label="Hotkey">
          <input
            value={trigger.hotkey}
            onChange={(event) =>
              onChange({
                ...trigger,
                hotkey: event.target.value,
                label: event.target.value
              })
            }
            className={inputClassName}
            placeholder="Cmd+Shift+J"
          />
        </Field>
      );
    case "manual":
      return (
        <div className="rounded-[18px] border border-dashed border-[color:var(--shell-border)] px-4 py-3 text-sm text-[color:var(--shell-text-secondary)]">
          Manual workflows run from this editor or as reusable subflows. They stay out of launcher discovery until you attach a slash or keyword trigger.
        </div>
      );
  }
}

function ReusableContractEditor({
  reusable,
  onChange
}: {
  reusable: WorkflowReusableDefinition;
  onChange(reusable: WorkflowReusableDefinition): void;
}) {
  function updateInput(index: number, patch: Partial<WorkflowReusableInputDefinition>) {
    onChange({
      ...reusable,
      inputs: reusable.inputs.map((input, currentIndex) =>
        currentIndex === index ? { ...input, ...patch } : input
      )
    });
  }

  function updateOutput(index: number, patch: Partial<WorkflowReusableOutputDefinition>) {
    onChange({
      ...reusable,
      outputs: reusable.outputs.map((output, currentIndex) =>
        currentIndex === index ? { ...output, ...patch } : output
      )
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-[color:var(--shell-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[color:var(--shell-text-primary)]">
            Input contract
          </div>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() =>
              onChange({
                ...reusable,
                inputs: [
                  ...reusable.inputs,
                  {
                    name: `input${reusable.inputs.length + 1}`,
                    valueType: "text",
                    required: true,
                    description: ""
                  }
                ]
              })
            }
          >
            Add input
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {reusable.inputs.length === 0 ? (
            <EmptyPanel
              title="No reusable inputs"
              detail="Add named inputs so Invoke Workflow nodes know what to pass."
            />
          ) : (
            reusable.inputs.map((input, index) => (
              <div key={`${input.name}:${index}`} className="rounded-[16px] border border-[color:var(--shell-border)] p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Name">
                    <input
                      value={input.name}
                      onChange={(event) => updateInput(index, { name: event.target.value })}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="Value type">
                    <select
                      value={input.valueType}
                      onChange={(event) =>
                        updateInput(index, {
                          valueType: event.target.value as WorkflowValueType
                        })
                      }
                      className={selectClassName}
                    >
                      {REUSABLE_VALUE_TYPES.map((valueType) => (
                        <option key={valueType} value={valueType}>
                          {valueType}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <input
                    value={input.description ?? ""}
                    onChange={(event) => updateInput(index, { description: event.target.value })}
                    className={inputClassName}
                  />
                </Field>
                <label className="mt-3 flex items-center gap-2 text-sm text-[color:var(--shell-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={input.required !== false}
                    onChange={(event) =>
                      updateInput(index, {
                        required: event.target.checked
                      })
                    }
                  />
                  Required
                </label>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[18px] border border-[color:var(--shell-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[color:var(--shell-text-primary)]">
            Output contract
          </div>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() =>
              onChange({
                ...reusable,
                outputs: [
                  ...reusable.outputs,
                  {
                    name: `output${reusable.outputs.length + 1}`,
                    valueType: "text",
                    description: "",
                    valueTemplate: "{{args.query}}"
                  }
                ]
              })
            }
          >
            Add output
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {reusable.outputs.length === 0 ? (
            <EmptyPanel
              title="No reusable outputs"
              detail="Declare output names and templates so Invoke Workflow callers receive a stable object."
            />
          ) : (
            reusable.outputs.map((output, index) => (
              <div key={`${output.name}:${index}`} className="rounded-[16px] border border-[color:var(--shell-border)] p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Name">
                    <input
                      value={output.name}
                      onChange={(event) => updateOutput(index, { name: event.target.value })}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="Value type">
                    <select
                      value={output.valueType}
                      onChange={(event) =>
                        updateOutput(index, {
                          valueType: event.target.value as WorkflowValueType
                        })
                      }
                      className={selectClassName}
                    >
                      {REUSABLE_VALUE_TYPES.map((valueType) => (
                        <option key={valueType} value={valueType}>
                          {valueType}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <input
                    value={output.description ?? ""}
                    onChange={(event) => updateOutput(index, { description: event.target.value })}
                    className={inputClassName}
                  />
                </Field>
                <Field label="Value template">
                  <textarea
                    value={output.valueTemplate}
                    onChange={(event) =>
                      updateOutput(index, { valueTemplate: event.target.value })
                    }
                    rows={3}
                    className={textareaClassName}
                  />
                </Field>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfigNote>
        Reusable outputs should point at stable values such as <code>{"{{nodes.template.default}}"}</code>
        or <code>{"{{nodes.request.default.json.items}}"}</code>. Invoke Workflow returns these as
        a structured object on its default output.
      </ConfigNote>
    </div>
  );
}

function NodeConfigEditor({
  workflow,
  workflows,
  node,
  onChange
}: {
  workflow: WorkflowRecord;
  workflows: WorkflowRecord[];
  node: WorkflowNode;
  onChange(nodeId: string, patch: Record<string, unknown>): void;
}) {
  switch (node.type) {
    case "query-input":
    case "clipboard-input":
    case "return-action-result":
      return (
        <ConfigNote>
          This node reads launcher context or forwards an existing action result. No extra
          configuration is needed.
        </ConfigNote>
      );
    case "file-input":
    case "return-files":
      return (
        <ConfigNote>
          This node type is intentionally marked as planned. You can keep it in a draft to
          sketch future flows, but runtime v1 will reject execution until it is implemented.
        </ConfigNote>
      );
    case "static-value":
      return (
        <>
          <Field label="Value">
            <textarea
              value={String(node.config.value ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  value: event.target.value
                })
              }
              rows={4}
              className={textareaClassName}
            />
          </Field>
          <Field label="Value type">
            <select
              value={String(node.config.valueType ?? "text")}
              onChange={(event) =>
                onChange(node.id, {
                  valueType: event.target.value
                })
              }
              className={selectClassName}
            >
              <option value="text">text</option>
              <option value="url">url</option>
              <option value="number">number</option>
              <option value="object">object</option>
              <option value="file">file</option>
            </select>
          </Field>
          <ConfigNote>
            Static values can also use references. For example, <code>{"{{args.query}}"}</code> stores the current trigger argument, and <code>{"{{nodes.parse.default | prettyjson}}"}</code> captures upstream structured output as text.
          </ConfigNote>
        </>
      );
    case "http-request":
      return (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Method">
              <select
                value={String(node.config.method ?? "GET")}
                onChange={(event) =>
                  onChange(node.id, {
                    method: event.target.value
                  })
                }
                className={selectClassName}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </Field>
            <Field label="Timeout (ms)">
              <input
                value={String(node.config.timeoutMs ?? 5000)}
                onChange={(event) =>
                  onChange(node.id, {
                    timeoutMs: event.target.value
                  })
                }
                className={inputClassName}
                placeholder="5000"
              />
            </Field>
          </div>
          <Field label="URL template">
            <textarea
              value={String(node.config.urlTemplate ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  urlTemplate: event.target.value
                })
              }
              rows={3}
              className={textareaClassName}
              placeholder="https://api.example.com/search"
            />
          </Field>
          <Field label="Headers JSON template">
            <textarea
              value={String(node.config.headersTemplate ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  headersTemplate: event.target.value
                })
              }
              rows={5}
              className={textareaClassName}
              placeholder={'{\n  "Accept": "application/json"\n}'}
            />
          </Field>
          <Field label="Query params JSON template">
            <textarea
              value={String(node.config.queryParamsTemplate ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  queryParamsTemplate: event.target.value
                })
              }
              rows={5}
              className={textareaClassName}
              placeholder={'{\n  "q": "{{args.query}}"\n}'}
            />
          </Field>
          <Field label="JSON body template">
            <textarea
              value={String(node.config.jsonBodyTemplate ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  jsonBodyTemplate: event.target.value
                })
              }
              rows={5}
              className={textareaClassName}
              placeholder={'{\n  "query": "{{args.query}}"\n}'}
            />
          </Field>
          <ConfigNote>
            HTTP Request runs through the workflow host, not the browser search layer. String
            fields support workflow references, and JSON blocks may resolve to objects such as
            <code>{"{{nodes.compose.default}}"}</code>.
          </ConfigNote>
        </>
      );
    case "invoke-workflow": {
      const reusableTargets = workflows.filter(
        (entry) => entry.id !== workflow.id && Boolean(entry.reusable)
      );
      const target = reusableTargets.find(
        (entry) => entry.id === String(node.config.workflowId ?? "")
      );
      const inputTemplates =
        node.config.inputTemplates && typeof node.config.inputTemplates === "object"
          ? (node.config.inputTemplates as Record<string, unknown>)
          : {};

      return (
        <>
          <Field label="Reusable workflow">
            <select
              value={String(node.config.workflowId ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  workflowId: event.target.value
                })
              }
              className={selectClassName}
            >
              <option value="">Select reusable workflow</option>
              {reusableTargets.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </Field>
          {target?.reusable ? (
            <>
              <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3 text-sm text-[color:var(--shell-text-secondary)]">
                {target.reusable.description || target.description || "Reusable subflow"}
              </div>
              <div className="space-y-3">
                {target.reusable.inputs.map((input) => (
                  <div key={input.name} className="rounded-[18px] border border-[color:var(--shell-border)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-[color:var(--shell-text-primary)]">
                        {input.name}
                      </div>
                      <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
                        {input.valueType}
                        {input.required === false ? " optional" : " required"}
                      </div>
                    </div>
                    {input.description ? (
                      <div className="mt-1 text-xs leading-5 text-[color:var(--shell-text-secondary)]">
                        {input.description}
                      </div>
                    ) : null}
                    <input
                      value={String(inputTemplates[input.name] ?? "")}
                      onChange={(event) =>
                        onChange(node.id, {
                          inputTemplates: {
                            ...inputTemplates,
                            [input.name]: event.target.value
                          }
                        })
                      }
                      className={`${inputClassName} mt-3`}
                      placeholder={
                        target.reusable?.inputs.length === 1 ? "{{input}}" : `{{args.${input.name}}}`
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
                  Declared outputs
                </div>
                <div className="mt-2 space-y-2 text-sm text-[color:var(--shell-text-secondary)]">
                  {target.reusable.outputs.map((output) => (
                    <div key={output.name}>
                      <span className="font-medium text-[color:var(--shell-text-primary)]">
                        {output.name}
                      </span>{" "}
                      · {output.valueType}
                      {output.description ? ` · ${output.description}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <ConfigNote>
              Select a reusable workflow target. Invoked subflows return a structured object on the
              default output, so downstream templates can read values such as
              <code>{"{{nodes.invoke.default.result}}"}</code>.
            </ConfigNote>
          )}
        </>
      );
    }
    case "template":
      return (
        <>
          <Field label="Template">
            <textarea
              value={String(node.config.template ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  template: event.target.value
                })
              }
              rows={5}
              className={textareaClassName}
            />
          </Field>
          <Field label="Output type">
            <select
              value={String(node.config.outputType ?? "text")}
              onChange={(event) =>
                onChange(node.id, {
                  outputType: event.target.value
                })
              }
              className={selectClassName}
            >
              <option value="text">text</option>
              <option value="url">url</option>
              <option value="number">number</option>
              <option value="object">object</option>
            </select>
          </Field>
          <ConfigNote>
            Prefer explicit references such as <code>{"{{args.query}}"}</code>, <code>{"{{context.clipboard}}"}</code>, <code>{"{{inputs.input}}"}</code>, or <code>{"{{nodes.parse.default}}"}</code>. Filters like <code>{"{{args.query | urlencode}}"}</code> and <code>{"{{inputs.input | prettyjson}}"}</code> are supported.
          </ConfigNote>
        </>
      );
    case "regex-replace":
      return (
        <>
          <Field label="Pattern">
            <input
              value={String(node.config.pattern ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  pattern: event.target.value
                })
              }
              className={inputClassName}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Replacement">
              <input
                value={String(node.config.replacement ?? "")}
                onChange={(event) =>
                  onChange(node.id, {
                    replacement: event.target.value
                  })
                }
                className={inputClassName}
              />
            </Field>
            <Field label="Flags">
              <input
                value={String(node.config.flags ?? "")}
                onChange={(event) =>
                  onChange(node.id, {
                    flags: event.target.value
                  })
                }
                className={inputClassName}
                placeholder="g"
              />
            </Field>
          </div>
          <ConfigNote>
            Regex Replace expects text input. Replacement text can still use workflow references if you need context-aware substitutions.
          </ConfigNote>
        </>
      );
    case "conditional-branch":
      return (
        <>
          <Field label="Operator">
            <select
              value={String(node.config.operator ?? "contains")}
              onChange={(event) =>
                onChange(node.id, {
                  operator: event.target.value
                })
              }
              className={selectClassName}
            >
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="starts-with">starts with</option>
              <option value="ends-with">ends with</option>
              <option value="matches-regex">matches regex</option>
              <option value="truthy">truthy</option>
              <option value="not-empty">not empty</option>
              <option value="is-empty">is empty</option>
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Compare value">
              <input
                value={String(node.config.compareValue ?? "")}
                onChange={(event) =>
                  onChange(node.id, {
                    compareValue: event.target.value
                  })
                }
                className={inputClassName}
              />
            </Field>
            <Field label="Regex flags">
              <input
                value={String(node.config.flags ?? "")}
                onChange={(event) =>
                  onChange(node.id, {
                    flags: event.target.value
                  })
                }
                className={inputClassName}
                placeholder="i"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-[color:var(--shell-text-secondary)]">
            <input
              type="checkbox"
              checked={node.config.caseSensitive === true}
              onChange={(event) =>
                onChange(node.id, {
                  caseSensitive: event.target.checked
                })
              }
            />
            Case sensitive
          </label>
          <ConfigNote>
            Compare value supports references too. Example: <code>{"{{args.ticket | upper}}"}</code>.
          </ConfigNote>
        </>
      );
    case "json-parse":
      return (
        <ConfigNote>
          JSON Parse expects text input and outputs a structured object. Pair it with Template, JSON Extract, or Conditional Branch for structured workflows.
        </ConfigNote>
      );
    case "json-extract":
      return (
        <>
          <Field label="Path">
            <input
              value={String(node.config.path ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  path: event.target.value
                })
              }
              className={inputClassName}
              placeholder="user.name or items.0.url"
            />
          </Field>
          <Field label="Output type">
            <select
              value={String(node.config.outputType ?? "text")}
              onChange={(event) =>
                onChange(node.id, {
                  outputType: event.target.value
                })
              }
              className={selectClassName}
            >
              <option value="text">text</option>
              <option value="number">number</option>
              <option value="object">object</option>
              <option value="boolean">boolean</option>
            </select>
          </Field>
          <Field label="Fallback">
            <input
              value={String(node.config.fallback ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  fallback: event.target.value
                })
              }
              className={inputClassName}
              placeholder="Optional value if the path is missing"
            />
          </Field>
          <ConfigNote>
            JSON Extract accepts structured object input, or text that can be parsed as JSON. Leave path empty to forward the whole object.
          </ConfigNote>
        </>
      );
    case "open-url":
      return (
        <Field label="URL template">
          <textarea
            value={String(node.config.urlTemplate ?? "")}
            onChange={(event) =>
              onChange(node.id, {
                urlTemplate: event.target.value
              })
            }
            rows={4}
            className={textareaClassName}
          />
        </Field>
      );
    case "copy-to-clipboard":
      return (
        <Field label="Text template">
          <textarea
            value={String(node.config.textTemplate ?? "")}
            onChange={(event) =>
              onChange(node.id, {
                textTemplate: event.target.value
              })
            }
            rows={4}
            className={textareaClassName}
          />
        </Field>
      );
    case "open-file":
      return (
        <Field label="Path template">
          <textarea
            value={String(node.config.pathTemplate ?? "")}
            onChange={(event) =>
              onChange(node.id, {
                pathTemplate: event.target.value
              })
            }
            rows={3}
            className={textareaClassName}
          />
        </Field>
      );
    case "run-shell-command":
      return (
        <>
          <Field label="Command template">
            <textarea
              value={String(node.config.commandTemplate ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  commandTemplate: event.target.value
                })
              }
              rows={4}
              className={textareaClassName}
            />
          </Field>
          <ConfigNote>
            Shell execution uses the shared workflow bridge and inherits the same timeout budget as the plugin host.
          </ConfigNote>
        </>
      );
    case "invoke-shared-action":
      return (
        <>
          <Field label="Action kind">
            <select
              value={String(node.config.actionKind ?? "copy-text")}
              onChange={(event) =>
                onChange(node.id, {
                  actionKind: event.target.value
                })
              }
              className={selectClassName}
            >
              {SHARED_ACTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Action title">
              <input
                value={String(node.config.title ?? "")}
                onChange={(event) =>
                  onChange(node.id, {
                    title: event.target.value
                  })
                }
                className={inputClassName}
              />
            </Field>
            <Field label="Description">
              <input
                value={String(node.config.description ?? "")}
                onChange={(event) =>
                  onChange(node.id, {
                    description: event.target.value
                  })
                }
                className={inputClassName}
              />
            </Field>
          </div>
          <Field label="Text payload template">
            <input
              value={String((node.config.payloadTemplates as Record<string, string> | undefined)?.text ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  payloadTemplates: {
                    ...((node.config.payloadTemplates as Record<string, string> | undefined) ?? {}),
                    text: event.target.value
                  }
                })
              }
              className={inputClassName}
              placeholder="{{input}}"
            />
          </Field>
          <Field label="URL payload template">
            <input
              value={String((node.config.payloadTemplates as Record<string, string> | undefined)?.url ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  payloadTemplates: {
                    ...((node.config.payloadTemplates as Record<string, string> | undefined) ?? {}),
                    url: event.target.value
                  }
                })
              }
              className={inputClassName}
              placeholder="https://example.com?q={{query}}"
            />
          </Field>
          <Field label="Path payload template">
            <input
              value={String((node.config.payloadTemplates as Record<string, string> | undefined)?.path ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  payloadTemplates: {
                    ...((node.config.payloadTemplates as Record<string, string> | undefined) ?? {}),
                    path: event.target.value
                  }
                })
              }
              className={inputClassName}
              placeholder="/tmp/{{query}}"
            />
          </Field>
        </>
      );
    case "invoke-plugin-command":
      return (
        <>
          <Field label="Plugin command">
            <input
              value={String(node.config.command ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  command: event.target.value
                })
              }
              className={inputClassName}
              placeholder="gh"
            />
          </Field>
          <Field label="Argument template">
            <textarea
              value={String(node.config.argumentTemplate ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  argumentTemplate: event.target.value
                })
              }
              rows={3}
              className={textareaClassName}
              placeholder="{{input}}"
            />
          </Field>
        </>
      );
    case "show-launcher-results":
      return (
        <>
          <Field label="Mode">
            <select
              value={String(node.config.mode ?? "query")}
              onChange={(event) =>
                onChange(node.id, {
                  mode: event.target.value
                })
              }
              className={selectClassName}
            >
              <option value="query">query providers</option>
              <option value="items">map workflow items</option>
            </select>
          </Field>
          {String(node.config.mode ?? "query") === "items" ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Items path">
                  <input
                    value={String(node.config.itemsPath ?? "")}
                    onChange={(event) =>
                      onChange(node.id, {
                        itemsPath: event.target.value
                      })
                    }
                    className={inputClassName}
                    placeholder="items"
                  />
                </Field>
                <Field label="Max items">
                  <input
                    value={String(node.config.maxItems ?? 8)}
                    onChange={(event) =>
                      onChange(node.id, {
                        maxItems: event.target.value
                      })
                    }
                    className={inputClassName}
                    placeholder="8"
                  />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Result type">
                  <select
                    value={String(node.config.resultType ?? "url")}
                    onChange={(event) =>
                      onChange(node.id, {
                        resultType: event.target.value
                      })
                    }
                    className={selectClassName}
                  >
                    <option value="url">url</option>
                    <option value="command">command</option>
                    <option value="file">file</option>
                    <option value="workflow">workflow</option>
                    <option value="system">system</option>
                  </select>
                </Field>
                <Field label="Result source">
                  <select
                    value={String(node.config.resultSource ?? "workflows")}
                    onChange={(event) =>
                      onChange(node.id, {
                        resultSource: event.target.value
                      })
                    }
                    className={selectClassName}
                  >
                    <option value="workflows">workflows</option>
                    <option value="plugins">plugins</option>
                    <option value="web">web</option>
                    <option value="system">system</option>
                  </select>
                </Field>
              </div>
              <Field label="Title template">
                <input
                  value={String(node.config.titleTemplate ?? "")}
                  onChange={(event) =>
                    onChange(node.id, {
                      titleTemplate: event.target.value
                    })
                  }
                  className={inputClassName}
                  placeholder="{{item.title}}"
                />
              </Field>
              <Field label="Subtitle template">
                <input
                  value={String(node.config.subtitleTemplate ?? "")}
                  onChange={(event) =>
                    onChange(node.id, {
                      subtitleTemplate: event.target.value
                    })
                  }
                  className={inputClassName}
                  placeholder="{{item.description}}"
                />
              </Field>
              <Field label="Icon template">
                <input
                  value={String(node.config.iconTemplate ?? "")}
                  onChange={(event) =>
                    onChange(node.id, {
                      iconTemplate: event.target.value
                    })
                  }
                  className={inputClassName}
                  placeholder="github"
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Default action">
                  <select
                    value={String(node.config.actionKind ?? "open-url")}
                    onChange={(event) =>
                      onChange(node.id, {
                        actionKind: event.target.value
                      })
                    }
                    className={selectClassName}
                  >
                    {WORKFLOW_RESULT_ACTION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Action title">
                  <input
                    value={String(node.config.actionTitle ?? "")}
                    onChange={(event) =>
                      onChange(node.id, {
                        actionTitle: event.target.value
                      })
                    }
                    className={inputClassName}
                    placeholder="Open result"
                  />
                </Field>
              </div>
              <Field label="Action payload JSON template">
                <textarea
                  value={String(node.config.actionPayloadTemplate ?? "")}
                  onChange={(event) =>
                    onChange(node.id, {
                      actionPayloadTemplate: event.target.value
                    })
                  }
                  rows={5}
                  className={textareaClassName}
                  placeholder={'{\n  "url": "{{item.html_url}}"\n}'}
                />
              </Field>
              <Field label="Result payload JSON template">
                <textarea
                  value={String(node.config.payloadTemplate ?? "")}
                  onChange={(event) =>
                    onChange(node.id, {
                      payloadTemplate: event.target.value
                    })
                  }
                  rows={5}
                  className={textareaClassName}
                  placeholder={'{\n  "url": "{{item.html_url}}"\n}'}
                />
              </Field>
              <ConfigNote>
                Items mode maps structured input into real launcher results. Use
                <code>{"{{item.*}}"}</code> for each mapped entry and <code>{"{{index}}"}</code> for
                the zero-based item index.
              </ConfigNote>
            </>
          ) : (
            <>
              <Field label="Query template">
                <textarea
                  value={String(node.config.queryTemplate ?? "")}
                  onChange={(event) =>
                    onChange(node.id, {
                      queryTemplate: event.target.value
                    })
                  }
                  rows={3}
                  className={textareaClassName}
                  placeholder="{{args.query}}"
                />
              </Field>
              <ConfigNote>
                Query mode asks the launcher host to run another provider search and returns a
                result list.
              </ConfigNote>
            </>
          )}
        </>
      );
    case "return-text":
      return (
        <>
          <Field label="Fallback return template">
            <textarea
              value={String(node.config.template ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  template: event.target.value
                })
              }
              rows={4}
              className={textareaClassName}
            />
          </Field>
          <ConfigNote>
            Return Text accepts direct text, URLs, booleans, structured objects, or action results and renders them into a final text output for the runtime summary.
          </ConfigNote>
        </>
      );
    case "emit-toast":
      return (
        <>
          <Field label="Toast template">
            <textarea
              value={String(node.config.textTemplate ?? "")}
              onChange={(event) =>
                onChange(node.id, {
                  textTemplate: event.target.value
                })
              }
              rows={3}
              className={textareaClassName}
              placeholder="{{input}}"
            />
          </Field>
          <ConfigNote>
            Emit Toast uses the host status or toast surface. It is useful for lightweight confirmation steps, but host presentation still varies by platform.
          </ConfigNote>
        </>
      );
  }
}

function RunCard({ run }: { run: WorkflowRunResult }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--shell-text-primary)]">
          {run.ok ? "Run succeeded" : "Run failed"}
        </div>
        <StatusPill
          label={
            run.ok
              ? "success"
              : run.failureStage === "validation"
                ? "validation"
                : "runtime"
          }
        />
      </div>

      <div className="mt-2 text-sm text-[color:var(--shell-text-secondary)]">
        {run.returnedText ?? run.actionResponse?.message ?? run.error ?? "No explicit output."}
      </div>

      {run.validationIssues.length > 0 ? (
        <div className="mt-3 rounded-[16px] border border-[color:var(--shell-border)] px-3 py-2 text-xs text-[color:var(--shell-text-secondary)]">
          {run.failureStage === "validation"
            ? `Validation blocked execution with ${run.validationIssues.length} issue(s).`
            : `Validation completed with ${run.validationIssues.length} warning or non-blocking issue(s).`}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {run.logs.map((log) => (
          <WorkflowLogEntryCard key={`${log.nodeId}:${log.startedAt}`} log={log} depth={0} />
        ))}
      </div>
    </div>
  );
}

function WorkflowLogEntryCard({
  log,
  depth
}: {
  log: WorkflowRunResult["logs"][number];
  depth: number;
}) {
  return (
    <div
      className="rounded-[16px] border border-[color:var(--shell-border)] px-3 py-3"
      style={{ marginLeft: depth === 0 ? 0 : depth * 12 }}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="font-medium text-[color:var(--shell-text-primary)]">
          {log.title}
        </div>
        <div className="text-[color:var(--shell-text-tertiary)]">
          {log.status} · {log.durationMs ?? 0}ms
        </div>
      </div>
      <div className="mt-2 text-xs leading-5 text-[color:var(--shell-text-secondary)]">
        {log.error ?? log.outputPreview?.summary ?? "No preview captured."}
      </div>
      {log.inputPreview?.length ? (
        <div className="mt-2 rounded-[12px] border border-[color:var(--shell-border)] px-3 py-2 text-[11px] leading-5 text-[color:var(--shell-text-secondary)]">
          Inputs: {log.inputPreview.map((entry) => entry.summary).join(" · ")}
        </div>
      ) : null}
      {log.outputPreview ? (
        <div className="mt-2 rounded-[12px] border border-[color:var(--shell-border)] px-3 py-2 text-[11px] leading-5 text-[color:var(--shell-text-secondary)]">
          Output: {log.outputPreview.summary}
        </div>
      ) : null}
      {log.nestedLogs?.length ? (
        <div className="mt-3 space-y-2 border-l border-[color:var(--shell-border)] pl-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
            Subflow
          </div>
          {log.nestedLogs.map((nestedLog) => (
            <WorkflowLogEntryCard
              key={`${nestedLog.nodeId}:${nestedLog.startedAt}`}
              log={nestedLog}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IssueCard({ issue }: { issue: WorkflowValidationIssue }) {
  return (
    <div
      className={clsx(
        "rounded-[18px] border px-3 py-3 text-sm",
        issue.level === "error"
          ? "border-rose-300/30 bg-rose-500/10 text-rose-100"
          : "border-amber-300/25 bg-amber-500/10 text-amber-50"
      )}
    >
      <div className="font-medium">
        {issue.nodeId ? `Node ${issue.nodeId}` : "Workflow"}
      </div>
      <div className="mt-1 leading-6">{issue.message}</div>
    </div>
  );
}

function PortList({
  title,
  ports,
  emptyLabel
}: {
  title: string;
  ports: Array<{
    name: string;
    valueType: string;
    acceptedValueTypes?: string[];
    required?: boolean;
  }>;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {ports.length === 0 ? (
          <div className="text-sm text-[color:var(--shell-text-tertiary)]">{emptyLabel}</div>
        ) : (
          ports.map((port) => (
            <div
              key={`${title}:${port.name}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="text-[color:var(--shell-text-primary)]">
                {port.name}
                {port.required ? " *" : ""}
              </div>
              <div className="text-right text-[color:var(--shell-text-tertiary)]">
                {port.acceptedValueTypes?.length
                  ? port.acceptedValueTypes.join(" | ")
                  : port.valueType}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConnectionSummary({
  label,
  edges
}: {
  label: string;
  edges: WorkflowEdge[];
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
        {label}
      </div>
      <div className="mt-2 text-sm text-[color:var(--shell-text-secondary)]">
        {edges.length === 0
          ? "None"
          : edges
              .map((edge) =>
                label === "Inbound"
                  ? `${edge.fromNodeId}.${edge.fromPort} -> ${edge.toInput}`
                  : `${edge.fromPort} -> ${edge.toNodeId}.${edge.toInput}`
              )
              .join(" · ")}
      </div>
    </div>
  );
}

function MetricChip({
  title,
  value,
  note
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
        {title}
      </div>
      <div className="mt-2 text-base font-semibold text-[color:var(--shell-text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-[color:var(--shell-text-secondary)]">
        {note}
      </div>
    </div>
  );
}

function EmptyPanel({
  title,
  detail
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-[color:var(--shell-border)] px-4 py-4 text-sm text-[color:var(--shell-text-secondary)]">
      <div className="font-medium text-[color:var(--shell-text-primary)]">{title}</div>
      <div className="mt-1 leading-6">{detail}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: WorkflowNodeStatus }) {
  return (
    <span
      className={clsx(
        "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
        status === "supported"
          ? "border border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
          : "border border-amber-300/25 bg-amber-400/10 text-amber-100"
      )}
    >
      {status}
    </span>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[color:var(--shell-border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-secondary)]">
      {label}
    </span>
  );
}

function ConfigNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3 text-sm leading-6 text-[color:var(--shell-text-secondary)]">
      {children}
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
        {label}
      </div>
      {children}
    </label>
  );
}

function createTriggerDraft(
  type: WorkflowTrigger["type"],
  current: WorkflowTrigger
): WorkflowTrigger {
  switch (type) {
    case "slash-command":
      return {
        type,
        label: current.label.startsWith("/") ? current.label : "/new-command",
        enabled: current.enabled,
        command:
          current.type === "slash-command" && current.command.trim().length > 0
            ? current.command
            : "/new-command",
        argumentName:
          current.type === "slash-command" ? current.argumentName : "query",
        placeholder: current.type === "slash-command" ? current.placeholder : "Arguments"
      };
    case "keyword":
      return {
        type,
        label: "keyword",
        enabled: current.enabled,
        keyword: current.type === "keyword" ? current.keyword : "keyword",
        aliases: current.type === "keyword" ? current.aliases ?? [] : [],
        argumentName: current.type === "keyword" ? current.argumentName : "query",
        placeholder: current.type === "keyword" ? current.placeholder : "Keyword input"
      };
    case "hotkey":
      return {
        type,
        label: "Cmd+Shift+P",
        enabled: current.enabled,
        hotkey: current.type === "hotkey" ? current.hotkey : "Cmd+Shift+P"
      };
    case "manual":
      return {
        type,
        label: "Manual",
        enabled: current.enabled
      };
  }
}

function buildWorkflowInvocation(workflow: WorkflowRecord, argsText: string): string {
  const trimmed = argsText.trim();
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  const slashTrigger = getWorkflowSlashCommand(workflow);
  if (slashTrigger) {
    return [slashTrigger.command, trimmed].filter(Boolean).join(" ").trim();
  }

  const keywordTrigger = getWorkflowKeywordTrigger(workflow);
  if (keywordTrigger) {
    const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase();
    const knownTokens = new Set(
      [keywordTrigger.keyword, ...(keywordTrigger.aliases ?? [])]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
    if (firstToken && knownTokens.has(firstToken)) {
      return trimmed;
    }
    return [keywordTrigger.keyword, trimmed].filter(Boolean).join(" ").trim();
  }

  return trimmed;
}

function getRunInputPlaceholder(workflow: WorkflowRecord): string {
  const slashTrigger = getWorkflowSlashCommand(workflow);
  if (slashTrigger) {
    return slashTrigger.placeholder ?? "Arguments for this slash command";
  }

  const keywordTrigger = getWorkflowKeywordTrigger(workflow);
  if (keywordTrigger) {
    return keywordTrigger.placeholder ?? "Arguments for this keyword trigger";
  }

  return "Sample input for manual run";
}

function getInvocationHint(workflow: WorkflowRecord): string {
  const example = getWorkflowTriggerExampleInvocation(workflow);
  switch (workflow.trigger.type) {
    case "slash-command":
      return `Launcher entrypoint: ${example ?? getWorkflowTriggerDisplayLabel(workflow)}`;
    case "keyword":
      return `Launcher keyword: ${example ?? getWorkflowTriggerDisplayLabel(workflow)}`;
    case "hotkey":
      return `Hotkey scaffold: ${workflow.trigger.hotkey}`;
    case "manual":
      return workflow.reusable
        ? "Reusable subflow. Invoke it from another workflow or run it here."
        : "This workflow currently runs from the editor only.";
  }
}

function getWorkflowTriggerRoleLabel(workflow: WorkflowRecord): string {
  switch (workflow.trigger.type) {
    case "slash-command":
      return "Slash";
    case "keyword":
      return "Keyword";
    case "hotkey":
      return "Hotkey";
    case "manual":
      return workflow.reusable ? "Reusable only" : "Manual";
  }
}

function getWorkflowTriggerSummary(workflow: WorkflowRecord): string {
  const example = getWorkflowTriggerExampleInvocation(workflow);
  const label = getWorkflowTriggerDisplayLabel(workflow);
  if (example && example !== label) {
    return `${label} • ${example}`;
  }
  return label;
}

function formatTimestamp(value?: number): string {
  if (!value) {
    return "Not run yet";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(value);
  } catch {
    return "Recently";
  }
}

const inputClassName =
  "w-full rounded-2xl border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-4 py-3 text-sm text-[color:var(--shell-text-primary)] outline-none transition placeholder:text-[color:var(--shell-text-muted)] focus:border-[color:var(--shell-border-strong)] focus:bg-[color:var(--shell-fill-soft)]";

const selectClassName = inputClassName;

const textareaClassName = `${inputClassName} min-h-[96px]`;

const primaryButtonClassName =
  "button-primary disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClassName =
  "button-secondary disabled:cursor-not-allowed disabled:opacity-60";
