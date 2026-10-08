import { useState, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import { CustomPipelineNode } from "./CustomPipelineNode";
import { ScopeContainerNode } from "./ScopeContainerNode";
import { CapsuleNode } from "./CapsuleNode";
import { ContextMenuPalette } from "./ContextMenuPalette";
import { NodeConfigInspector } from "./NodeConfigInspector";
import { CanvasToolbar } from "./CanvasToolbar";
import { PipelineParametersPanel, type ParameterTab } from "./PipelineParametersPanel";
import { VariableDropMenu } from "./VariableDropMenu";
import { RunPipelineModal } from "../../dialogs/RunPipelineModal";
import { LiveExecutionDrawer } from "./LiveExecutionDrawer";
import { PipelineFormScopeProvider } from "../../form-scope/PipelineFormScope";
import { useValidatePipeline } from "../../hooks/usePipelineGraph";
import { useNodePalette } from "../../hooks/usePipelines";
import type { ExtendedPipelineGraphDto } from "../../hooks/usePipelineGraph";
import {
  usePipelineDraftState,
  usePipelineLiveTracking,
  useCanvasConnectionRules,
  useVariableDropHandler,
  useCanvasContextMenu,
} from "./hooks";

interface PipelineCanvasProps {
  projectId: string;
  graph: ExtendedPipelineGraphDto;
}

const nodeTypes = {
  pipelineNode: CustomPipelineNode,
  scopeContainer: ScopeContainerNode,
  capsuleNode: CapsuleNode,
};

const defaultEdgeOptions = {
  animated: true,
  style: { strokeWidth: 2 },
};

export function PipelineCanvas({ projectId, graph }: PipelineCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { data: paletteItems = [] } = useNodePalette(projectId);

  // 1. Headless Draft State & Auto-save (with Stage Auto-expanding)
  const draft = usePipelineDraftState(graph);

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
  const validateMutation = useValidatePipeline(graph.id);

  const handleValidate = async () => {
    try {
      const res = await validateMutation.mutateAsync({ runtimeInputs: {} });
      if (res.isValid) {
        toast.success("Pipeline graph is valid with no unresolved dependencies.");
      } else {
        if (res.cycleNodeIds && res.cycleNodeIds.length > 0) {
          toast.error(`Pipeline contains a cycle involving nodes: ${res.cycleNodeIds.join(", ")}`);
        } else if (res.unresolvedPins && res.unresolvedPins.length > 0) {
          toast.error(
            `Unresolved required pins: ${res.unresolvedPins.map((p) => p.pinLabel || p.pinKey).join(", ")}`
          );
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Validation failed");
    }
  };

  const scopeValue = useMemo(
    () => ({
      pipelineId: graph.id,
      projectId,
      parameters: draft.parameters,
      variables: draft.parameters.filter((p) => p.kind === 3 || (p.kind as unknown) === "Variable"),
      edges: draft.edges,
      nodes: draft.nodes,
    }),
    [graph.id, projectId, draft.parameters, draft.edges, draft.nodes]
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
          onOpenRunModal={() => setIsRunModalOpen(true)}
          onOpenHistory={() => {
            live.setDrawerDefaultTab("history");
            live.setIsDrawerOpen(true);
          }}
          onValidate={handleValidate}
          isValidating={validateMutation.isPending}
        />

        {/* Main Canvas & Inspector Layout */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative flex-1 h-full">
            <ReactFlow
              nodes={draft.nodes}
              edges={draft.edges}
              onNodesChange={draft.handleNodesChange}
              onEdgesChange={draft.handleEdgesChange}
              onNodeDrag={draft.onNodeDrag}
              onNodeDragStop={draft.onNodeDragStop}
              onNodesDelete={draft.onNodesDelete}
              onEdgesDelete={conn.onEdgesDelete}
              onEdgeContextMenu={conn.onEdgeContextMenu}
              onNodeContextMenu={ctxMenu.onNodeContextMenu}
              onConnect={conn.onConnect}
              isValidConnection={conn.isValidConnection}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              deleteKeyCode={["Backspace", "Delete"]}
              onNodeClick={(_, node) => {
                if (node.type !== "scopeContainer") {
                  draft.setSelectedNodeId(node.id);
                } else {
                  draft.setSelectedNodeId(null);
                }
              }}
              onPaneClick={() => draft.setSelectedNodeId(null)}
              onPaneContextMenu={ctxMenu.onPaneContextMenu}
              onDragOver={dnd.onDragOver}
              onDrop={dnd.onDrop}
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
      </div>
    </PipelineFormScopeProvider>
  );
}
