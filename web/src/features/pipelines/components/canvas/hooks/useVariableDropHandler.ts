import { useState, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import { toast } from "sonner";
import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";
import type { CustomPipelineNodeData } from "../CustomPipelineNode";

interface UseVariableDropHandlerArgs {
  paletteItems: NodePaletteItemDto[];
  graphId: string;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setSelectedNodeId: (id: string | null) => void;
  setIsDirty: (dirty: boolean) => void;
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
}

export function useVariableDropHandler({
  paletteItems,
  graphId,
  setNodes,
  setSelectedNodeId,
  setIsDirty,
  screenToFlowPosition,
}: UseVariableDropHandlerArgs) {
  const [isVariablesOpen, setIsVariablesOpen] = useState(true);
  const [varDropState, setVarDropState] = useState<{
    varName: string;
    screenPos: { x: number; y: number };
    flowPos: { x: number; y: number };
  } | null>(null);

  // Spawn Get/Set Variable Node at specific coordinates
  const handleSpawnVariableNodeAt = useCallback(
    (
      toolKey: "GetVariable" | "SetVariable",
      varName: string,
      position: { x: number; y: number }
    ) => {
      const isGet = toolKey === "GetVariable";
      const newNodeId = crypto.randomUUID();

      if (isGet) {
        const newNode: Node = {
          id: newNodeId,
          type: "capsuleNode",
          position,
          data: {
            refId: "GetVariable",
            key: varName,
            label: varName,
            category: "Variable",
            pinType: 0,
            pipelineId: graphId,
          },
        };

        setNodes((nds) => [...nds, newNode]);
        setSelectedNodeId(newNodeId);
        setIsDirty(true);
        toast.success(`Spawned '${varName}' capsule`);
        return;
      }

      const label = `Set ${varName}`;
      const paletteItem = paletteItems.find((p) => p.key === toolKey);

      const newNode: Node = {
        id: newNodeId,
        type: "pipelineNode",
        position,
        data: {
          refId: toolKey,
          kind: "Tool",
          label: paletteItem?.label || label,
          category: paletteItem?.category || "Variables",
          executor: paletteItem?.executor || "builtin",
          inputs: (paletteItem?.inputs as PinDefinition[]) || [],
          outputs: (paletteItem?.outputs as PinDefinition[]) || [],
          configValues: { VariableName: varName },
          pipelineId: graphId,
        } as CustomPipelineNodeData,
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newNodeId);
      setIsDirty(true);
      toast.success(`Spawned '${label}' node`);
    },
    [paletteItems, graphId, setNodes, setSelectedNodeId, setIsDirty]
  );

  const handleSpawnCapsule = useCallback(
    (
      key: string,
      category: "Variable" | "Runner" | "Repository" | "Workspace" | "Context" | "Input" = "Variable",
      pinType: any = 0
    ) => {
      const newNodeId = crypto.randomUUID();
      const newNode: Node = {
        id: newNodeId,
        type: "capsuleNode",
        position: {
          x: 350 + Math.random() * 80,
          y: 250 + Math.random() * 80,
        },
        data: {
          refId:
            category === "Runner"
              ? "RunnerContext"
              : category === "Repository"
              ? "RepositoryContext"
              : category === "Workspace"
              ? "WorkspaceContext"
              : category === "Input"
              ? "GetInput"
              : "GetVariable",
          key,
          label: key,
          category,
          pinType,
          pipelineId: graphId,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newNodeId);
      setIsDirty(true);
      toast.success(`Spawned '${key}' ${category} capsule`);
    },
    [graphId, setNodes, setSelectedNodeId, setIsDirty]
  );

  // Spawn Get/Set Variable Node directly from VariablePanel button
  const handleSpawnVariableNode = useCallback(
    (toolKey: "GetVariable" | "SetVariable", varName: string) => {
      handleSpawnVariableNodeAt(toolKey, varName, {
        x: 300 + Math.random() * 60,
        y: 250 + Math.random() * 60,
      });
    },
    [handleSpawnVariableNodeAt]
  );

  // Drag over Canvas handler
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // Drop Variable or Parameter onto Canvas handler (Unreal-style)
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const rawParam = e.dataTransfer.getData("application/pipeline-parameter");
      const rawVar = e.dataTransfer.getData("application/pipeline-variable");
      const raw = rawParam || rawVar;
      if (!raw) return;

      try {
        const itemData = JSON.parse(raw);
        const varName = itemData.name || itemData.key;
        if (!varName) return;

        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

        // If dropped item is an Input parameter, spawn an Input Capsule directly
        if (
          itemData.category === "Input" ||
          itemData.kind === 1 ||
          String(itemData.kind).toLowerCase() === "input"
        ) {
          const newNodeId = crypto.randomUUID();
          const newNode: Node = {
            id: newNodeId,
            type: "capsuleNode",
            position: flowPos,
            data: {
              refId: "GetInput",
              key: varName,
              label: itemData.label || varName,
              category: "Input",
              pinType: itemData.type ?? 0,
              cardinality: itemData.cardinality ?? 0,
              structType: itemData.structType,
              description: itemData.description,
              pipelineId: graphId,
            },
          };
          setNodes((nds) => [...nds, newNode]);
          setSelectedNodeId(newNodeId);
          setIsDirty(true);
          toast.success(`Spawned '${varName}' Input capsule`);
          return;
        }

        // Standard Variable Drop (Get / Set menu)
        if (e.ctrlKey) {
          handleSpawnVariableNodeAt("GetVariable", varName, flowPos);
        } else if (e.altKey) {
          handleSpawnVariableNodeAt("SetVariable", varName, flowPos);
        } else {
          setVarDropState({
            varName,
            screenPos: { x: e.clientX, y: e.clientY },
            flowPos,
          });
        }
      } catch {
        // Ignore malformed drop
      }
    },
    [screenToFlowPosition, handleSpawnVariableNodeAt, graphId, setNodes, setSelectedNodeId, setIsDirty]
  );

  return {
    isVariablesOpen,
    setIsVariablesOpen,
    varDropState,
    setVarDropState,
    handleSpawnVariableNode,
    handleSpawnVariableNodeAt,
    handleSpawnCapsule,
    onDragOver,
    onDrop,
  };
}
