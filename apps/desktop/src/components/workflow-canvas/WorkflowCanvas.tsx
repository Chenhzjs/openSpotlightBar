import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowNodeType, WorkflowRecord } from "@pulse/shared-types";
import { WORKFLOW_NODE_LIBRARY_BY_TYPE } from "@pulse/core";

import { createNodeDraft } from "../../features/workflows/editor";
import {
  toReactFlowElements,
  applyNodePositions,
  connectionToEdge,
  type CanvasNode,
  type CanvasEdge
} from "./canvas-adapters";
import { WorkflowCanvasNode } from "./WorkflowCanvasNode";
import { WorkflowCanvasEdge } from "./WorkflowCanvasEdge";

const nodeTypes = { workflowNode: WorkflowCanvasNode };
const edgeTypes = { workflowEdge: WorkflowCanvasEdge };

interface WorkflowCanvasProps {
  workflow: WorkflowRecord;
  allWorkflows?: WorkflowRecord[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onUpdateDraft: (next: WorkflowRecord) => void;
  onNodeConfigChange?: (nodeId: string, patch: Record<string, unknown>) => void;
  onRunWorkflow?: () => void;
}

function WorkflowCanvasInner({
  workflow,
  allWorkflows,
  onSelectNode,
  onUpdateDraft,
  onNodeConfigChange,
  onRunWorkflow
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [initialized, setInitialized] = useState(false);

  const onDebugValueChange = useCallback(
    (nodeId: string, value: string) => {
      onNodeConfigChange?.(nodeId, { debugValue: value });
    },
    [onNodeConfigChange]
  );

  // Derive ReactFlow elements from the workflow prop (controlled)
  const { nodes: rfNodes, edges: rfEdges } = useMemo(
    () => toReactFlowElements(workflow, allWorkflows, onDebugValueChange),
    [workflow, allWorkflows, onDebugValueChange]
  );

  // Local state only for in-progress drag (position not yet committed)
  const [nodes, setNodes] = useState<CanvasNode[]>(rfNodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(rfEdges);

  // Sync from workflow prop whenever it changes
  useEffect(() => {
    setNodes(rfNodes);
  }, [rfNodes]);
  useEffect(() => {
    setEdges(rfEdges);
  }, [rfEdges]);

  // fitView after nodes change, but only once ReactFlow has initialized
  useEffect(() => {
    if (!initialized) return;
    // Wait for ReactFlow to measure node dimensions after state update
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 200 });
      });
    });
  }, [workflow.id, initialized, fitView]);

  const onInit = useCallback(() => {
    setInitialized(true);
  }, []);

  const onNodesChange: OnNodesChange<CanvasNode> = useCallback(
    (changes) => {
      // Apply position/selection changes locally for smooth dragging
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  const onEdgesChange: OnEdgesChange<CanvasEdge> = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...connection, type: "workflowEdge", data: { fromPort: connection.sourceHandle ?? "default" } },
          eds
        ) as CanvasEdge[]
      );
      const newEdge = connectionToEdge(connection);
      onUpdateDraft({
        ...workflow,
        edges: [...workflow.edges, newEdge],
        updatedAt: Date.now()
      });
    },
    [workflow, onUpdateDraft]
  );
  const onNodeDragStop: NodeMouseHandler<CanvasNode> = useCallback(
    (_event, node) => {
      const moved = [{ id: node.id, position: node.position }];
      const nextNodes = applyNodePositions(workflow, moved);
      onUpdateDraft({
        ...workflow,
        nodes: nextNodes,
        updatedAt: Date.now()
      });
    },
    [workflow, onUpdateDraft]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: CanvasNode) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  const onNodesDelete = useCallback(
    (deleted: CanvasNode[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      onUpdateDraft({
        ...workflow,
        nodes: workflow.nodes.filter((n) => !deletedIds.has(n.id)),
        edges: workflow.edges.filter(
          (e) => !deletedIds.has(e.fromNodeId) && !deletedIds.has(e.toNodeId)
        ),
        updatedAt: Date.now()
      });
    },
    [workflow, onUpdateDraft]
  );

  const onEdgesDelete = useCallback(
    (deleted: CanvasEdge[]) => {
      const deletedIds = new Set(deleted.map((e) => e.id));
      onUpdateDraft({
        ...workflow,
        edges: workflow.edges.filter((e) => !deletedIds.has(e.id)),
        updatedAt: Date.now()
      });
    },
    [workflow, onUpdateDraft]
  );

  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge) => {
      const source = connection.source ?? ("source" in connection ? connection.source : null);
      const target = connection.target ?? ("target" in connection ? connection.target : null);
      if (!source || !target || source === target) return false;
      const sourceNode = workflow.nodes.find((n) => n.id === source);
      const targetNode = workflow.nodes.find((n) => n.id === target);
      if (!sourceNode || !targetNode) return false;
      const sourceDef = WORKFLOW_NODE_LIBRARY_BY_TYPE[sourceNode.type];
      const targetDef = WORKFLOW_NODE_LIBRARY_BY_TYPE[targetNode.type];
      const sourceHandle = connection.sourceHandle ?? "default";
      const targetHandle = connection.targetHandle ?? "input";
      const sourcePort = sourceDef.outputs.find((p) => p.name === sourceHandle);
      const targetPort = targetDef.inputs.find((p) => p.name === targetHandle);
      if (!sourcePort || !targetPort) return false;
      const accepted = targetPort.acceptedValueTypes ?? [targetPort.valueType];
      return accepted.includes(sourcePort.valueType) || sourcePort.valueType === targetPort.valueType;
    },
    [workflow]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/workflow-node-type") as WorkflowNodeType;
      if (!nodeType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      const newNode = createNodeDraft(nodeType, position);
      onUpdateDraft({
        ...workflow,
        nodes: [...workflow.nodes, newNode],
        updatedAt: Date.now()
      });
      onSelectNode(newNode.id);
    },
    [workflow, onUpdateDraft, onSelectNode, screenToFlowPosition]
  );

  return (
    <div ref={reactFlowWrapper} className="absolute inset-0 rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={onInit}
        isValidConnection={isValidConnection}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Controls className="workflow-canvas-controls" />
        <MiniMap
          className="workflow-canvas-minimap"
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
      {onRunWorkflow && (
        <button
          type="button"
          className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--shell-text-primary)] shadow-sm backdrop-blur-sm hover:bg-[color:var(--shell-fill-muted)] transition-colors"
          onClick={onRunWorkflow}
        >
          <span className="text-[10px]">▶</span> Run
        </button>
      )}
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider key={props.workflow.id}>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
