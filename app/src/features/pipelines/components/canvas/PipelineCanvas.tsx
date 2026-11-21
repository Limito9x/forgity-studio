import { useState, useMemo, useEffect, useCallback } from "react";
import type { NodePaletteItemDto } from "@/features/pipelines/types/pipelineGraphTypes";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ConnectionLineType,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import { PipelineNodeRouter } from "./nodes/PipelineNodeRouter";
import { NodeDefinitionsProvider } from "./NodeDefinitions";
import { CapsuleNode } from "./CapsuleNode";
import { ContextMenuPalette } from "./ContextMenuPalette";
import { NodeConfigInspector } from "./NodeConfigInspector";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasDiagnosticsPanel } from "./CanvasDiagnosticsPanel";
import { PipelineParametersPanel, type ParameterTab } from "./PipelineParametersPanel";
import { LiveExecutionDrawer } from "./LiveExecutionDrawer";
import { ExecutionStatusBanner } from "./ExecutionStatusBanner";
import { RunPipelineModal } from "../../dialogs/RunPipelineModal";
import { PipelineFormScopeProvider } from "../../form-scope/PipelineFormScope";
import type { ExtendedPipelineGraphDto } from "../../hooks/usePipelineGraph";
import {
  usePipelineDraftState,
  usePipelineLiveTracking,
  useCanvasConnectionRules,
  useCanvasContextMenu,
  usePipelineDiagnostics,
} from "./hooks";
import { usePipelineWorkspaceOptional } from "../../context/PipelineWorkspaceContext";
import type { IPipelineStorageAdapter } from "../../adapters/pipelineStorageAdapter";

interface PipelineCanvasProps {
  projectId: string;
  rootPath?: string | null;
  graph: ExtendedPipelineGraphDto;
  storage?: IPipelineStorageAdapter;
  pipelineKind?: "component" | "master";
  componentExecutor?: string;
  viewMode?: "visual" | "yaml";
  onToggleViewMode?: (mode: "visual" | "yaml") => void;
  readOnly?: boolean;
  onRequestRun?: () => void;
  onOpenPublishModal?: () => void;
  paletteItems?: NodePaletteItemDto[];
}

const nodeTypes = {
  pipelineNode: PipelineNodeRouter,
  capsuleNode: CapsuleNode,
};

const defaultEdgeOptions = {
  animated: true,
  type: "smoothstep",
  pathOptions: { borderRadius: 12 },
  style: { strokeWidth: 2 },
};

export function PipelineCanvas(props: PipelineCanvasProps) {
  const workspaceCtx = usePipelineWorkspaceOptional();

  // Normalize palette items from Context/Strategy or explicit prop (include unprefixed aliases for local script keys)
  const allDefinitions = useMemo(() => {
    const sourceItems =
      props.paletteItems && props.paletteItems.length > 0
        ? props.paletteItems
        : workspaceCtx?.paletteItems ?? [];
    const list: NodePaletteItemDto[] = [];
    for (const item of sourceItems) {
      list.push(item);
      if (
        item.key &&
        item.key.startsWith("local:") &&
        !item.key.startsWith("local:constant:") &&
        !item.key.startsWith("local:component:") &&
        !item.key.startsWith("local:struct:")
      ) {
        const unprefixedKey = item.key.slice("local:".length);
        list.push({
          ...item,
          key: unprefixedKey,
          id: unprefixedKey,
        });
      }
    }
    return list;
  }, [workspaceCtx?.paletteItems]);

  return (
    <ReactFlowProvider>
      <NodeDefinitionsProvider items={allDefinitions}>
        <PipelineCanvasContent
          key={`${props.projectId}:${props.graph.id}:${(props.graph as any).activeSnapshotId || (props.graph as any).graphHash || ""}`}
          {...props}
        />
      </NodeDefinitionsProvider>
    </ReactFlowProvider>
  );
}

function PipelineCanvasContent({
  projectId,
  rootPath = null,
  graph,
  storage: directStorage,
  pipelineKind = "master",
  componentExecutor,
  viewMode = "visual",
  onToggleViewMode,
  readOnly: requestedReadOnly,
  onRequestRun,
  onOpenPublishModal,
}: PipelineCanvasProps) {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const workspaceCtx = usePipelineWorkspaceOptional();
  const readOnly =
    requestedReadOnly ||
    workspaceCtx?.capabilities.canEditGraph === false;
  const canSaveDraft = workspaceCtx?.capabilities.canSaveDraft ?? true;
  const canRun = workspaceCtx?.capabilities.canRun ?? !requestedReadOnly;
  const storage = (directStorage || workspaceCtx?.storage || { source: "local" }) as IPipelineStorageAdapter;
  const isLocalMode = (workspaceCtx?.source ?? storage.source) === "local";
  const structCatalogue = workspaceCtx?.structCatalogue ?? [];
  const [isAutoFollow, setIsAutoFollow] = useState(true);

  // 1. Headless Draft State & Flat Storage Strategy (NO STAGES)
  const draft = usePipelineDraftState(graph, structCatalogue, {
    storage,
    canSaveDraft,
  });

  // 1b. Real-time Diagnostics Scope
  const [isDiagnosticsPanelOpen, setIsDiagnosticsPanelOpen] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const diagnosticsScope = usePipelineDiagnostics({
    graph,
    nodes: draft.nodes,
    edges: draft.edges,
    parameters: draft.parameters,
    isDirty: draft.isDirty,
    lastSavedDiagnostics: null,
    isLocalMode,
  });

  const handleFocusNode = (nodeId: string) => {
    const targetNode = draft.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;
    const width = (targetNode.measured?.width ?? targetNode.width ?? 240) as number;
    const height = (targetNode.measured?.height ?? targetNode.height ?? 120) as number;
    setCenter(targetNode.position.x + width / 2, targetNode.position.y + height / 2, { zoom: 1.2, duration: 500 });
    draft.setSelectedNodeId(nodeId);
  };

  // 2. Real-time Live Execution Tracking (SignalR in Cloud Mode, Tauri stdout in Local Mode)
  const live = usePipelineLiveTracking({
    pipelineId: isLocalMode ? "" : graph.id,
    isLocalMode,
    setNodes: draft.setNodes,
  });

  // 3. Connection Rules
  const conn = useCanvasConnectionRules({
    nodes: draft.nodes,
    edges: draft.edges,
    setEdges: draft.setEdges,
    setNodes: draft.setNodes,
    setIsDirty: draft.setIsDirty,
    structCatalogue,
  });

  // 4. Flat Canvas Context Menu
  const ctxMenu = useCanvasContextMenu({
    screenToFlowPosition,
  });

  // Parameters panel tab state (Inputs | Outputs)
  const [paramTab, setParamTab] = useState<ParameterTab>("inputs");
  const [isParametersOpen, setIsParametersOpen] = useState(false);
  const { isDrawerOpen, setIsDrawerOpen } = live;

  // Auto-switch to Inputs tab when Start node is selected, or Outputs tab when Return node is selected
  useEffect(() => {
    if (!draft.selectedNode) return;
    const kind = String(draft.selectedNode.data?.kind || "").toLowerCase();
    const refId = String(draft.selectedNode.data?.refId || "").toLowerCase();
    if (kind === "start" || refId === "start") {
      setParamTab("inputs");
      setIsParametersOpen(true);
    } else if (kind === "return" || refId === "return") {
      setParamTab("outputs");
      setIsParametersOpen(true);
    }
  }, [draft.selectedNodeId]);

  const handleCancelExecution = async () => {
    if (!live.activeExecutionId) return;
    try {
      await workspaceCtx?.cancelExecution?.(live.activeExecutionId);
      toast.success("Pipeline cancellation requested.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel execution.");
    }
  };

  const scopeValue = useMemo(
    () => ({
      pipelineId: graph.id,
      projectId,
      parameters: draft.parameters,
      variables: [],
      edges: draft.edges,
      nodes: draft.nodes,
      diagnosticsScope,
    }),
    [graph.id, projectId, draft.parameters, draft.edges, draft.nodes, diagnosticsScope]
  );

  const isLocked = live.isExecutionRunning;

  // Camera Auto-Follow during live execution
  useEffect(() => {
    if (!isAutoFollow || !live.activeRunningNodeId) return;
    const targetNode = draft.nodes.find((n) => n.id === live.activeRunningNodeId);
    if (!targetNode) return;
    const width = (targetNode.measured?.width ?? targetNode.width ?? 240) as number;
    const height = (targetNode.measured?.height ?? targetNode.height ?? 120) as number;
    setCenter(targetNode.position.x + width / 2, targetNode.position.y + height / 2, { zoom: 1.25, duration: 650 });
  }, [live.activeRunningNodeId, isAutoFollow, draft.nodes, setCenter]);

  // Handle Palette Script node drag & drop directly onto Canvas
  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/forgity-node")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      const nodeData = e.dataTransfer.getData("application/forgity-node");
      if (nodeData) {
        e.preventDefault();
        try {
          const item = JSON.parse(nodeData) as NodePaletteItemDto;
          const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          draft.handleSelectPaletteItem(item, null, flowPos);
        } catch (err) {
          console.warn("Failed to drop palette item onto canvas:", err);
        }
      }
    },
    [screenToFlowPosition, draft]
  );

  return (
    <PipelineFormScopeProvider value={scopeValue}>
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
        {/* Top Toolbar */}
        <CanvasToolbar
          projectId={projectId}
          pipelineId={graph.id}
          pipelineName={graph.name}
          triggerType={graph.triggerType}
          isSaving={draft.isSaving}
          canSaveDraft={canSaveDraft}
          canRun={canRun}
          isLocalMode={isLocalMode}
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
          isRunningDraft={false}
          readOnly={readOnly}
          onOpenRunModal={onRequestRun ?? (() => setIsRunModalOpen(true))}
          onOpenHistory={
            readOnly
              ? undefined
              : () => {
                  live.setDrawerDefaultTab("history");
                  setIsDrawerOpen(true);
                }
          }
          onOpenSnapshots={undefined}
          onValidate={diagnosticsScope.validateDraft}
          isValidating={diagnosticsScope.isValidating}
          validationStatus={diagnosticsScope.validationStatus}
          errorCount={diagnosticsScope.errorCount}
          warningCount={diagnosticsScope.warningCount}
          isStale={diagnosticsScope.isStale}
          isDiagnosticsPanelOpen={isDiagnosticsPanelOpen}
          onToggleDiagnosticsPanel={() => setIsDiagnosticsPanelOpen((prev) => !prev)}
          isExecuting={live.isExecutionRunning}
          isAutoFollow={isAutoFollow}
          onToggleAutoFollow={() => setIsAutoFollow((prev) => !prev)}
          onOpenPublishModal={onOpenPublishModal}
        />

        {/* Main Canvas & Inspector Layout */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative flex-1 h-full">
            {/* Floating Execution Status & Mode Banner */}
            {live.activeExecutionId && (
              <ExecutionStatusBanner
                executionId={live.activeExecutionId}
                isRunning={live.isExecutionRunning}
                isFailed={
                  isLocalMode
                    ? live.localRunStatus === "failed"
                    : String(live.currentExecution?.status).toLowerCase() === "failed"
                }
                isSucceeded={
                  isLocalMode
                    ? live.localRunStatus === "succeeded"
                    : String(live.currentExecution?.status).toLowerCase() === "completed"
                }
                errorMessage={isLocalMode ? live.localRunError : live.currentExecution?.errorMessage}
                onOpenLogs={() => {
                  live.setDrawerDefaultTab("logs");
                  setIsDrawerOpen(true);
                }}
                onExitView={live.clearActiveExecution}
                onCancel={handleCancelExecution}
              />
            )}

            {/* Blackboard Parameters Slide-Over Panel (Inputs & Outputs Only) */}
            <PipelineParametersPanel
              pipelineId={graph.id}
              parameters={draft.parameters}
              isOpen={isParametersOpen}
              onToggle={() => setIsParametersOpen((prev) => !prev)}
              activeTab={paramTab}
              onTabChange={setParamTab}
              onAddParameter={(param) => {
                draft.setParameters([...draft.parameters, param]);
              }}
              onUpdateParameter={(key, partial) => {
                draft.setParameters(
                  draft.parameters.map((p) => (p.key === key ? { ...p, ...partial } : p))
                );
              }}
              onDeleteParameter={(key) => {
                draft.setParameters(draft.parameters.filter((p) => p.key !== key));
              }}
            />

            {/* Diagnostics Overlay Panel */}
            {isDiagnosticsPanelOpen && (
              <CanvasDiagnosticsPanel
                diagnostics={diagnosticsScope.diagnostics}
                errorCount={diagnosticsScope.errorCount}
                warningCount={diagnosticsScope.warningCount}
                validationStatus={diagnosticsScope.validationStatus}
                isStale={diagnosticsScope.isStale}
                isValidating={diagnosticsScope.isValidating}
                onRevalidate={diagnosticsScope.validateDraft}
                onFocusNode={handleFocusNode}
                onClose={() => setIsDiagnosticsPanelOpen(false)}
              />
            )}

            {/* ReactFlow Flat Canvas */}
            <ReactFlow
              nodes={draft.nodes}
              edges={draft.edges}
              onNodesChange={isLocked || readOnly ? undefined : draft.onNodesChange}
              onEdgesChange={isLocked || readOnly ? undefined : draft.onEdgesChange}
              onConnect={isLocked || readOnly ? undefined : conn.onConnect}
              isValidConnection={conn.isValidConnection}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              connectionLineType={ConnectionLineType.SmoothStep}
              onNodeClick={(_event, node) => {
                draft.setSelectedNodeId(node.id);
              }}
              onPaneClick={() => {
                draft.setSelectedNodeId(null);
                ctxMenu.closePalette();
              }}
              onPaneContextMenu={readOnly ? undefined : ctxMenu.onPaneContextMenu}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault();
                if (!isLocked && !readOnly) {
                  draft.onEdgesChange([{ type: "remove", id: edge.id }]);
                }
              }}
              onDragOver={readOnly ? undefined : handleCanvasDragOver}
              onDrop={readOnly ? undefined : handleCanvasDrop}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              nodesDraggable={!isLocked && !readOnly}
              nodesConnectable={!isLocked && !readOnly}
              elementsSelectable={true}
              deleteKeyCode={isLocked || readOnly ? null : ["Backspace", "Delete"]}
              className="bg-dot-pattern"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.5}
                color="#27272a"
                className="opacity-75"
              />
              <Controls
                position="bottom-left"
                className="!bg-background/80 !border-border/60 !shadow-lg backdrop-blur-md rounded-xl overflow-hidden"
              />
              <MiniMap
                position="bottom-right"
                nodeStrokeWidth={3}
                zoomable
                pannable
                className="!bg-background/80 !border-border/60 !shadow-lg backdrop-blur-md rounded-xl overflow-hidden"
                nodeColor={(n) => {
                  if (n.data?.kind === "Start") return "#10b981";
                  if (n.data?.kind === "Return") return "#f43f5e";
                  return "#3b82f6";
                }}
              />
            </ReactFlow>

            {/* Context Menu Palette on Flat Canvas */}
            <ContextMenuPalette
              position={ctxMenu.palettePosition}
              onClose={ctxMenu.closePalette}
              projectId={projectId}
              rootPath={rootPath}
              pipelineKind={pipelineKind}
              componentExecutor={componentExecutor}
              currentPipelineId={graph.id}
              onSelect={(item) => {
                draft.handleSelectPaletteItem(item, null, ctxMenu.flowCoordinates);
              }}
            />
          </div>

          {/* Node Config Inspector Panel */}
          {draft.selectedNode && (
            <NodeConfigInspector
              pipelineId={graph.id}
              node={draft.selectedNode}
              triggerType={graph.triggerType}
              onClose={() => draft.setSelectedNodeId(null)}
              onUpdateConfig={(nodeId, pinId, val) => draft.handleUpdateConfig(nodeId, pinId, val)}
              onDeleteNode={() => draft.handleDeleteNode(draft.selectedNode!.id)}
              onRenameNode={(newLabel) => draft.handleRenameNode(draft.selectedNode!.id, newLabel)}
              isReadOnly={readOnly}
            />
          )}
        </div>

        {/* Live Execution Drawer */}
        {isDrawerOpen && (
          <LiveExecutionDrawer
            pipelineId={graph.id}
            rootPath={rootPath}
            executionId={live.activeExecutionId}
            onClose={() => setIsDrawerOpen(false)}
            defaultTab={live.drawerDefaultTab}
            localLogs={live.localLogs}
            localRunStatus={live.localRunStatus}
            localRunError={live.localRunError}
            liveNodeStatuses={live.liveNodeStatuses}
            liveNodeOutputs={live.liveNodeOutputs}
            liveNodeErrors={live.liveNodeErrors}
            nodes={draft.nodes}
          />
        )}

        <RunPipelineModal
          pipelineId={graph.id}
          pipelineName={graph.name || (isLocalMode ? "Local Pipeline" : "Pipeline")}
          projectId={projectId}
          nodes={draft.nodes}
          edges={draft.edges}
          parameters={draft.parameters}
          isOpen={isRunModalOpen}
          onClose={() => setIsRunModalOpen(false)}
          onRunLocal={(runtimeInputs) =>
            storage.run({ projectId, pipelineId: graph.id, runtimeInputs })
          }
        />
      </div>
    </PipelineFormScopeProvider>
  );
}
