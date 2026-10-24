import { useState, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ConnectionLineType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import { PipelineNodeRouter } from "./nodes/PipelineNodeRouter";
import { NodeDefinitionsProvider } from "./NodeDefinitions";
import { ScopeContainerNode } from "./ScopeContainerNode";
import { CapsuleNode } from "./CapsuleNode";
import { ContextMenuPalette } from "./ContextMenuPalette";
import { NodeConfigInspector } from "./NodeConfigInspector";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasDiagnosticsPanel } from "./CanvasDiagnosticsPanel";
import { PipelineParametersPanel, type ParameterTab } from "./PipelineParametersPanel";
import { VariableDropMenu } from "./VariableDropMenu";
import { RunPipelineModal } from "../../dialogs/RunPipelineModal";
import { LiveExecutionDrawer } from "./LiveExecutionDrawer";
import { ExecutionStatusBanner } from "./ExecutionStatusBanner";
import { DeleteStageConfirmDialog } from "./DeleteStageConfirmDialog";
import { PipelineFormScopeProvider } from "../../form-scope/PipelineFormScope";
import { useNodePalette, useCancelPipelineExecution } from "../../hooks/usePipelines";
import { useGetStructCatalogue } from "@/gen/endpoints/pipelines/pipelines";
import type { ExtendedPipelineGraphDto } from "../../hooks/usePipelineGraph";
import {
  usePipelineDraftState,
  usePipelineLiveTracking,
  useCanvasConnectionRules,
  useVariableDropHandler,
  useCanvasContextMenu,
  usePipelineDiagnostics,
} from "./hooks";

interface PipelineCanvasProps {
  projectId: string;
  graph: ExtendedPipelineGraphDto;
}

const nodeTypes = {
  pipelineNode: PipelineNodeRouter,
  scopeContainer: ScopeContainerNode,
  capsuleNode: CapsuleNode,
};

const defaultEdgeOptions = {
  animated: true,
  type: "smoothstep",
  pathOptions: { borderRadius: 12 },
  style: { strokeWidth: 2 },
};

export function PipelineCanvas(props: PipelineCanvasProps) {
  const definitions = useNodePalette(props.projectId);
  if (!definitions.data) {
    if (definitions.isError) return <div role="alert">Failed to load node definitions. <button onClick={() => void definitions.refetch()}>Retry</button></div>;
    return <div role="status">Loading node definitions...</div>;
  }
  return <NodeDefinitionsProvider items={definitions.data}><PipelineCanvasContent key={`${props.projectId}:${props.graph.id}`} {...props} /></NodeDefinitionsProvider>;
}

function PipelineCanvasContent({ projectId, graph }: PipelineCanvasProps) {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const { data: paletteItems = [] } = useNodePalette(projectId);
  const { data: structCatalogue = [] } = useGetStructCatalogue({ projectId });
  const [isAutoFollow, setIsAutoFollow] = useState(true);

  // 1. Headless Draft State & Auto-save (with Stage Auto-expanding)
  const draft = usePipelineDraftState(graph, structCatalogue);

  // 1b. Real-time Diagnostics Scope
  const [isDiagnosticsPanelOpen, setIsDiagnosticsPanelOpen] = useState(false);
  const diagnosticsScope = usePipelineDiagnostics({
    graph,
    nodes: draft.nodes,
    edges: draft.edges,
    parameters: draft.parameters,
    isDirty: draft.isDirty,
    lastSavedDiagnostics: null,
  });

  const handleFocusNode = (nodeId: string) => {
    const targetNode = draft.nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    let posX = targetNode.position.x;
    let posY = targetNode.position.y;
    if (targetNode.parentId) {
      const parent = draft.nodes.find((n) => n.id === targetNode.parentId);
      if (parent) {
        posX += parent.position.x;
        posY += parent.position.y;
      }
    }
    const width = (targetNode.measured?.width ?? targetNode.width ?? 240) as number;
    const height = (targetNode.measured?.height ?? targetNode.height ?? 120) as number;
    setCenter(posX + width / 2, posY + height / 2, { zoom: 1.2, duration: 500 });
    draft.setSelectedNodeId(nodeId);
  };

  // 2. Real-time Live Execution Tracking & SignalR
  const live = usePipelineLiveTracking({
    pipelineId: graph.id,
    setNodes: draft.setNodes,
  });

  // 3. Two-tier Connection Rules & Edge Events
  const conn = useCanvasConnectionRules({
    nodes: draft.nodes,
    edges: draft.edges,
    setEdges: draft.setEdges,
    setNodes: draft.setNodes,
    setIsDirty: draft.setIsDirty,
    structCatalogue,
  });

  // 4. Blackboard Variable Drag & Drop
  const dnd = useVariableDropHandler({
    paletteItems,
    graphId: graph.id,
    setNodes: draft.setNodes,
    setSelectedNodeId: draft.setSelectedNodeId,
    setIsDirty: draft.setIsDirty,
    screenToFlowPosition,
  });

  // 5. Canvas Context Menu, Hit-testing & Coordinates
  const ctxMenu = useCanvasContextMenu({
    nodes: draft.nodes,
    screenToFlowPosition,
  });

  // Parameters panel tab state (Inputs | Outputs | Variables | Context)
  const [paramTab, setParamTab] = useState<ParameterTab>("variables");

  // Auto-switch to Inputs tab when Start node is selected, or Outputs tab when Return node is selected
  useEffect(() => {
    if (!draft.selectedNode) return;
    const kind = String(draft.selectedNode.data?.kind || "").toLowerCase();
    const refId = String(draft.selectedNode.data?.refId || "").toLowerCase();
    if (kind === "start" || refId === "start") {
      setParamTab("inputs");
      dnd.setIsVariablesOpen(true);
    } else if (kind === "return" || refId === "return") {
      setParamTab("outputs");
      dnd.setIsVariablesOpen(true);
    }
  }, [draft.selectedNodeId]);

  // Run modal state & Validation
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);



  const cancelMutation = useCancelPipelineExecution(graph.id);
  const handleCancelExecution = async () => {
    if (!live.activeExecutionId) return;
    try {
      await cancelMutation.mutateAsync({ id: live.activeExecutionId });
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
      variables: draft.parameters.filter((p) => p.kind === "Variable" || (p.kind as any) === 3),
      edges: draft.edges,
      nodes: draft.nodes,
      diagnosticsScope,
    }),
    [graph.id, projectId, draft.parameters, draft.edges, draft.nodes, diagnosticsScope]
  );

  // Canvas Lock status: Locked when executing or inspecting an execution
  const isLocked = Boolean(live.isExecutionRunning || live.activeExecutionId);

  // Camera Auto-Follow: Smoothly center on the active running node during execution
  useEffect(() => {
    if (!isAutoFollow || !live.activeRunningNodeId) return;

    const targetNode = draft.nodes.find((n) => n.id === live.activeRunningNodeId);
    if (!targetNode) return;

    let posX = targetNode.position.x;
    let posY = targetNode.position.y;

    if (targetNode.parentId) {
      const parent = draft.nodes.find((n) => n.id === targetNode.parentId);
      if (parent) {
        posX += parent.position.x;
        posY += parent.position.y;
      }
    }

    const width = (targetNode.measured?.width ?? targetNode.width ?? 240) as number;
    const height = (targetNode.measured?.height ?? targetNode.height ?? 120) as number;

    setCenter(posX + width / 2, posY + height / 2, { zoom: 1.25, duration: 650 });
  }, [live.activeRunningNodeId, isAutoFollow, draft.nodes, setCenter]);

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
          onOpenRunModal={() => setIsRunModalOpen(true)}
          onOpenHistory={() => {
            live.setDrawerDefaultTab("history");
            live.setIsDrawerOpen(true);
          }}
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
        />

        {/* Main Canvas & Inspector Layout */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative flex-1 h-full">
            {/* Floating Execution Status & Mode Banner */}
            {live.activeExecutionId && (
              <ExecutionStatusBanner
                executionId={live.activeExecutionId}
                isRunning={live.isExecutionRunning}
                isFailed={Number(live.currentExecution?.status) === 5}
                isSucceeded={Number(live.currentExecution?.status) === 4}
                errorMessage={live.currentExecution?.errorMessage}
                onOpenLogs={() => {
                  live.setDrawerDefaultTab("logs");
                  live.setIsDrawerOpen(true);
                }}
                onExitView={live.clearActiveExecution}
                onCancel={handleCancelExecution}
                isCancelling={cancelMutation.isPending}
              />
            )}

            <ReactFlow
              nodes={draft.nodes}
              edges={draft.edges}
              nodesDraggable={!isLocked}
              nodesConnectable={!isLocked}
              elementsSelectable={true}
              onNodesChange={isLocked ? undefined : draft.handleNodesChange}
              onEdgesChange={isLocked ? undefined : draft.handleEdgesChange}
              onNodeDrag={isLocked ? undefined : draft.onNodeDrag}
              onNodeDragStop={isLocked ? undefined : draft.onNodeDragStop}
              onNodesDelete={isLocked ? undefined : draft.onNodesDelete}
              onBeforeDelete={isLocked ? undefined : draft.handleBeforeDelete}
              onEdgesDelete={isLocked ? undefined : conn.onEdgesDelete}
              onEdgeContextMenu={conn.onEdgeContextMenu}
              onNodeContextMenu={ctxMenu.onNodeContextMenu}
              onConnect={isLocked ? undefined : conn.onConnect}
              isValidConnection={conn.isValidConnection}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              connectionLineType={ConnectionLineType.SmoothStep}
              deleteKeyCode={isLocked ? null : ["Backspace", "Delete"]}
              onNodeClick={(_, node) => {
                if (node.type !== "scopeContainer") {
                  draft.setSelectedNodeId(node.id);
                } else {
                  draft.setSelectedNodeId(null);
                }
              }}
              onPaneClick={() => draft.setSelectedNodeId(null)}
              onPaneContextMenu={isLocked ? undefined : ctxMenu.onPaneContextMenu}
              onDragOver={isLocked ? undefined : dnd.onDragOver}
              onDrop={isLocked ? undefined : dnd.onDrop}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              onlyRenderVisibleElements={true}
              proOptions={{ hideAttribution: true }}
              className="bg-dot-grid"
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-40" />
              <Controls />
              <MiniMap
                zoomable
                pannable
                nodeColor={(node) => {
                  if (node.type === "scopeContainer") return "transparent";
                  const kind = String((node.data as any)?.kind || "").toLowerCase();
                  if (kind === "start") return "#10b981";
                  if (kind === "tool") return "#3b82f6";
                  return "#a855f7";
                }}
              />
            </ReactFlow>

            {/* Right-click Context Palette Popover */}
            <ContextMenuPalette
              projectId={projectId}
              position={ctxMenu.palettePosition}
              targetStage={ctxMenu.targetStage}
              onClose={ctxMenu.closePalette}
              onSelect={(item) => {
                draft.handleSelectPaletteItem(item, ctxMenu.targetStage, ctxMenu.flowCoordinates);
                ctxMenu.closePalette();
              }}
              onCreateStage={(stage) => {
                draft.handleCreateStage(stage, ctxMenu.flowCoordinates);
                ctxMenu.closePalette();
              }}
            />

            {/* Unreal-style Variable Drop Context Menu */}
            {dnd.varDropState && (() => {
              const currentVarDrop = dnd.varDropState;
              return (
                <VariableDropMenu
                  varName={currentVarDrop.varName}
                  position={currentVarDrop.screenPos}
                  onSelect={(action) => {
                    const toolKey = action === "Get" ? "GetVariable" : "SetVariable";
                    dnd.handleSpawnVariableNodeAt(toolKey, currentVarDrop.varName, currentVarDrop.flowPos);
                    dnd.setVarDropState(null);
                  }}
                  onClose={() => dnd.setVarDropState(null)}
                />
              );
            })()}

            {/* Left-side Parameters Panel (Inputs | Outputs | Variables | Context) */}
            <PipelineParametersPanel
              pipelineId={graph.id}
              parameters={draft.parameters}
              onAddParameter={draft.handleAddParameter}
              onUpdateParameter={draft.handleUpdateParameter}
              onDeleteParameter={draft.handleDeleteParameter}
              onSpawnCapsule={dnd.handleSpawnCapsule}
              onSpawnAction={(toolKey, varName) => dnd.handleSpawnVariableNode(toolKey, varName)}
              isOpen={dnd.isVariablesOpen}
              onToggle={() => dnd.setIsVariablesOpen((prev) => !prev)}
              activeTab={paramTab}
              onTabChange={setParamTab}
            />

            {/* Floating Graph Diagnostics Panel */}
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

            {/* Live Execution Run & History Drawer */}
            {live.isDrawerOpen && (
              <LiveExecutionDrawer
                pipelineId={graph.id}
                executionId={live.activeExecutionId}
                defaultTab={live.drawerDefaultTab}
                onSelectExecution={(id) => {
                  live.setActiveExecutionId(id);
                  live.setDrawerDefaultTab("inspect");
                }}
                onClose={() => live.setIsDrawerOpen(false)}
              />
            )}
          </div>

          {/* Selected Node Config Inspector Side Panel */}
          {draft.selectedNode && draft.selectedNode.type !== "scopeContainer" && (
            <NodeConfigInspector
              pipelineId={graph.id}
              node={draft.selectedNode}
              triggerType={graph.triggerType}
              triggerConfig={graph.triggerConfig}
              onClose={() => draft.setSelectedNodeId(null)}
              onUpdateConfig={draft.handleUpdateConfig}
              onDeleteNode={draft.handleDeleteNode}
              isReadOnly={isLocked}
            />
          )}
        </div>

        {/* Run Pipeline Modal */}
        {isRunModalOpen && (
          <RunPipelineModal
            pipelineId={graph.id}
            pipelineName={graph.name}
            projectId={projectId}
            nodes={draft.nodes}
            edges={draft.edges}
            parameters={draft.parameters}
            isOpen={isRunModalOpen}
            onClose={() => setIsRunModalOpen(false)}
            onExecutionStarted={(execId) => {
              live.setActiveExecutionId(execId);
              live.setDrawerDefaultTab("logs");
              live.setIsDrawerOpen(true);
            }}
          />
        )}

        {/* Delete Stage Scope Confirmation Dialog */}
        <DeleteStageConfirmDialog
          open={Boolean(draft.pendingStageDelete)}
          onOpenChange={(open) => {
            if (!open) draft.cancelStageDelete();
          }}
          stageName={draft.pendingStageDelete?.stageName || ""}
          childCount={draft.pendingStageDelete?.childCount || 0}
          onConfirm={draft.confirmStageDelete}
          onCancel={draft.cancelStageDelete}
        />
      </div>
    </PipelineFormScopeProvider>
  );
}
