import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNodesState, useEdgesState, MarkerType } from "@xyflow/react";
import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";
import { toast } from "sonner";
import type {
  ExtendedPipelineGraphDto,
  SavePipelineNodeItem,
  SavePipelineEdgeItem,
  PipelineParameterDto,
} from "../../../hooks/usePipelineGraph";
import {
  PipelineNodeKind,
  useSavePipelineGraph,
} from "../../../hooks/usePipelineGraph";
import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";
import type { CustomPipelineNodeData } from "../CustomPipelineNode";
import { isExecPin } from "../CustomPipelineNode";
import type { CapsuleNodeData } from "../CapsuleNode";
import type { ScopeContainerNodeData } from "../ScopeContainerNode";
import type { StageCreationOption } from "../ContextMenuPalette";
import {
  isExecEdge,
  expandStageBoundsIfNeeded,
  expandStageLiveWhileDragging,
} from "./canvasUtils";

export function usePipelineDraftState(graph: ExtendedPipelineGraphDto) {
  // 1. Initial nodes mapping from DTO (Unified Nodes architecture)
  const initialNodes: Node[] = useMemo(() => {
    const rawNodes = (graph.nodes || []) as any[];

    const stageNodes: Node[] = [];
    const regularNodes: Node[] = [];

    for (const n of rawNodes) {
      const kindStr = String(n.kind || "").toLowerCase();
      const refIdStr = String(n.refId || "").toLowerCase();
      const isStart = kindStr === "start" || refIdStr === "start";
      const isContainer =
        n.kind === PipelineNodeKind.Container ||
        kindStr === "container" ||
        n.kind === 8 ||
        refIdStr === "scopecontainer" ||
        refIdStr === "container";
      const isCapsule =
        n.kind === PipelineNodeKind.Capsule ||
        kindStr === "capsule" ||
        n.kind === 9 ||
        refIdStr === "capsule" ||
        refIdStr === "getvariable";

      if (isContainer) {
        const meta = n.metadata || {};
        stageNodes.push({
          id: n.id,
          type: "scopeContainer",
          position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
          style: {
            width: n.size?.width ?? 520,
            height: n.size?.height ?? 380,
          },
          data: {
            stageId: n.id,
            name: meta.name || n.label || "Container",
            kind: meta.kind || "Worker",
            executorKey: meta.executorKey || "blender",
            targetRunnerId: meta.targetRunnerId || null,
            pipelineId: graph.id,
          } as ScopeContainerNodeData,
        });
      } else if (isCapsule) {
        const cfg = n.configValues || {};
        const meta = n.metadata || {};
        const varKey =
          cfg.VariableName || cfg.variableName || cfg.key || n.label || "";
        regularNodes.push({
          id: n.id,
          type: "capsuleNode",
          deletable: true,
          parentId: undefined,
          position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
          data: {
            refId: n.refId || "Capsule",
            key: varKey,
            label: n.label || varKey,
            category:
              meta.category ||
              n.category ||
              (refIdStr.includes("runner")
                ? "Runner"
                : refIdStr.includes("workspace")
                  ? "Workspace"
                  : "Variable"),
            pinType: cfg.type ?? 0,
            cardinality: cfg.cardinality ?? 0,
            structType: cfg.structType,
            description: cfg.description,
            pipelineId: graph.id,
          } as CapsuleNodeData,
        });
      } else {
        regularNodes.push({
          id: n.id,
          type: "pipelineNode",
          deletable: !isStart,
          parentId: n.parentId ?? undefined,
          position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
          data: {
            refId: n.refId,
            kind: n.kind,
            label: n.label,
            category: n.category,
            executor: n.executor,
            inputs: n.inputs || [],
            outputs: n.outputs || [],
            configValues: n.configValues || {},
            pipelineId: graph.id,
          } as CustomPipelineNodeData,
        });
      }
    }

    // Stage containers placed first in array so child nodes render on top
    return [...stageNodes, ...regularNodes];
  }, [graph.nodes, graph.id]);

  // 2. Initial edges mapping from DTO (Unified Edges architecture)
  const initialEdges: Edge[] = useMemo(() => {
    return ((graph.edges || []) as any[]).map((e) => {
      const isExec = isExecEdge(e.sourcePin, e.targetPin, e.kind);
      return {
        id: e.id,
        source: e.sourceNodeId,
        sourceHandle: e.sourcePin,
        target: e.targetNodeId,
        targetHandle: e.targetPin,
        animated: !isExec,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isExec ? "currentColor" : "#38bdf8",
          width: 16,
          height: 16,
        },
        className: isExec ? "text-foreground" : "text-sky-400",
        style: isExec
          ? {
              stroke: "currentColor",
              strokeWidth: 3.5,
              strokeDasharray: "none",
            }
          : { stroke: "#38bdf8", strokeWidth: 2 },
      };
    });
  }, [graph.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync initial graph when graph ID changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [graph.id, initialNodes, initialEdges, setNodes, setEdges]);

  // Draft state & Auto-save
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveMutation = useSavePipelineGraph(graph.id);
  const isInitialMount = useRef(true);

  // Helper to synchronize Start and Return node pins from current parameters
  const syncParametersToNodes = useCallback(
    (currentParams: PipelineParameterDto[]) => {
      const inputParams = currentParams.filter(
        (p) => p.kind === 1 || (p.kind as unknown) === "Input",
      );
      const outputParams = currentParams.filter(
        (p) => p.kind === 2 || (p.kind as unknown) === "Output",
      );

      setNodes((currentNodes) => {
        let hasChanges = false;
        const updatedNodes = currentNodes.map((node) => {
          const nodeData = node.data as CustomPipelineNodeData;
          if (!nodeData) return node;

          const kindStr = String(nodeData.kind || "").toLowerCase();
          const refIdStr = String(nodeData.refId || "").toLowerCase();

          const isStart =
            kindStr === "start" ||
            refIdStr === "start" ||
            refIdStr === "beginexecute";
          const isReturn =
            kindStr === "return" ||
            refIdStr === "return" ||
            refIdStr === "endexecute";

          if (isStart) {
            // Keep Exec out and context pins (Resource, Workspace)
            const systemPins = (nodeData.outputs || []).filter(
              (p) =>
                isExecPin(p) || p.id === "Resource" || p.id === "Workspace",
            );
            if (systemPins.length === 0) {
              systemPins.push({
                id: "exec_out",
                label: "Start",
                kind: "Exec" as any,
                isRequired: false,
              });
            }

            const paramPins: PinDefinition[] = inputParams.map((p) => ({
              id: p.key,
              label: p.label || p.key,
              kind: "Data" as any,
              primitiveType: p.type as any,
              cardinality: p.cardinality as any,
              metadata: p.structType as any,
              isRequired: p.isRequired,
              defaultValue: p.defaultValue,
            }));

            const nextOutputs = [...systemPins, ...paramPins];
            const isSame =
              nodeData.outputs?.length === nextOutputs.length &&
              nodeData.outputs.every(
                (p, idx) =>
                  p.id === nextOutputs[idx].id &&
                  p.label === nextOutputs[idx].label &&
                  p.primitiveType === nextOutputs[idx].primitiveType,
              );

            if (!isSame) {
              hasChanges = true;
              return {
                ...node,
                data: {
                  ...nodeData,
                  outputs: nextOutputs,
                },
              };
            }
          }

          if (isReturn) {
            // Keep Exec in pin
            const systemPins = (nodeData.inputs || []).filter(isExecPin);
            if (systemPins.length === 0) {
              systemPins.push({
                id: "Exec",
                label: "Exec",
                kind: "Exec" as any,
                isRequired: false,
              });
            }

            const paramPins: PinDefinition[] = outputParams.map((p) => ({
              id: p.key,
              label: p.label || p.key,
              kind: "Data" as any,
              primitiveType: p.type as any,
              cardinality: p.cardinality as any,
              metadata: p.structType as any,
              isRequired: p.isRequired,
              defaultValue: p.defaultValue,
            }));

            const nextInputs = [...systemPins, ...paramPins];
            const isSame =
              nodeData.inputs?.length === nextInputs.length &&
              nodeData.inputs.every(
                (p, idx) =>
                  p.id === nextInputs[idx].id &&
                  p.label === nextInputs[idx].label &&
                  p.primitiveType === nextInputs[idx].primitiveType,
              );

            if (!isSame) {
              hasChanges = true;
              return {
                ...node,
                data: {
                  ...nodeData,
                  inputs: nextInputs,
                },
              };
            }
          }

          return node;
        });

        return hasChanges ? updatedNodes : currentNodes;
      });
    },
    [setNodes],
  );

  // Parameters state
  const [parameters, setParameters] = useState<PipelineParameterDto[]>(() => {
    return (graph.parameters as PipelineParameterDto[]) || [];
  });

  useEffect(() => {
    if (graph.parameters) {
      const nextParams = graph.parameters as PipelineParameterDto[];
      setParameters(nextParams);
      syncParametersToNodes(nextParams);
    }
  }, [graph.parameters, syncParametersToNodes]);

  const handleAddParameter = useCallback(
    (param: PipelineParameterDto) => {
      setParameters((prev) => {
        const next = [...prev, param];
        syncParametersToNodes(next);
        return next;
      });
      setIsDirty(true);
    },
    [syncParametersToNodes],
  );

  const handleUpdateParameter = useCallback(
    (key: string, updated: Partial<PipelineParameterDto>) => {
      setParameters((prev) => {
        const next = prev.map((p) =>
          p.key.toLowerCase() === key.toLowerCase() ? { ...p, ...updated } : p,
        );
        syncParametersToNodes(next);
        return next;
      });
      setIsDirty(true);
    },
    [syncParametersToNodes],
  );

  const handleDeleteParameter = useCallback(
    (key: string) => {
      const keyLower = key.toLowerCase();
      setParameters((prev) => {
        const next = prev.filter((p) => p.key.toLowerCase() !== keyLower);
        syncParametersToNodes(next);
        return next;
      });

      // Clean up orphaned edges connected to this deleted parameter on Start/Return
      setEdges((prev) =>
        prev.filter((e) => {
          const sourceNode = nodes.find((n) => n.id === e.source);
          const isStart =
            String(sourceNode?.data?.refId || "").toLowerCase() === "start";
          if (isStart && e.sourceHandle?.toLowerCase() === keyLower)
            return false;

          const targetNode = nodes.find((n) => n.id === e.target);
          const isReturn =
            String(targetNode?.data?.refId || "").toLowerCase() === "return";
          if (isReturn && e.targetHandle?.toLowerCase() === keyLower)
            return false;

          return true;
        }),
      );

      setIsDirty(true);
    },
    [nodes, setEdges, syncParametersToNodes],
  );

  // Selected node
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  // Mark dirty on meaningful node/edge changes
  const handleNodesChange: OnNodesChange<Node> = useCallback(
    (changes) => {
      onNodesChange(changes);
      const hasMeaningfulChange = changes.some((c) => c.type !== "select");
      if (hasMeaningfulChange) {
        setIsDirty(true);
      }
    },
    [onNodesChange],
  );

  const handleEdgesChange: OnEdgesChange<Edge> = useCallback(
    (changes) => {
      onEdgesChange(changes);
      const hasMeaningfulChange = changes.some((c) => c.type !== "select");
      if (hasMeaningfulChange) {
        setIsDirty(true);
      }
    },
    [onEdgesChange],
  );

  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  // Auto-save debounce effect (600ms)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!isDirty) return;

    const timer = setTimeout(async () => {
      // Mark clean first to avoid infinite re-trigger loop if server returns error
      setIsDirty(false);

      try {
        setIsSaving(true);
        const saveNodes: SavePipelineNodeItem[] = [];
        const saveEdges: SavePipelineEdgeItem[] = [];

        for (const n of nodes) {
          if (n.type === "scopeContainer") {
            const stageData = n.data as ScopeContainerNodeData;
            saveNodes.push({
              id: n.id,
              refId: "ScopeContainer",
              kind: "Container" as any,
              parentId: null,
              positionX: n.position.x,
              positionY: n.position.y,
              width: typeof n.style?.width === "number" ? n.style.width : 520,
              height:
                typeof n.style?.height === "number" ? n.style.height : 380,
              configValues: {},
              metadata: {
                name: stageData.name,
                kind: stageData.kind,
                executorKey: stageData.executorKey || "blender",
                targetRunnerId: stageData.targetRunnerId || null,
              },
            });
          } else if (n.type === "capsuleNode") {
            const cData = n.data as CapsuleNodeData;
            saveNodes.push({
              id: n.id,
              refId: cData.refId || "Capsule",
              kind: "Capsule" as any,
              parentId: null,
              positionX: n.position.x,
              positionY: n.position.y,
              configValues: {
                VariableName: cData.key,
                key: cData.key,
                type: cData.pinType,
                cardinality: cData.cardinality,
                structType: cData.structType,
                description: cData.description,
              },
              metadata: {
                category: cData.category,
              },
            });
          } else {
            const nodeData = n.data as CustomPipelineNodeData;
            saveNodes.push({
              id: n.id,
              refId: nodeData.refId,
              kind:
                (nodeData.kind as PipelineNodeKind) || PipelineNodeKind.Tool,
              parentId: n.parentId || null,
              positionX: n.position.x,
              positionY: n.position.y,
              configValues: nodeData.configValues || {},
            });
          }
        }

        for (const e of edges) {
          saveEdges.push({
            id: e.id,
            sourceNodeId: e.source,
            sourcePin: e.sourceHandle || "",
            targetNodeId: e.target,
            targetPin: e.targetHandle || "",
          });
        }

        await saveMutationRef.current.mutateAsync({
          nodes: saveNodes,
          edges: saveEdges,
          parameters,
        });
      } catch (err: any) {
        console.error("Auto-save pipeline graph failed:", err);
        toast.error(
          `Auto-save failed: ${err?.message || "Internal server error"}`,
        );
      } finally {
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [nodes, edges, isDirty]);

  // Real-time fast dynamic expansion while dragging a node
  const onNodeDrag = useCallback(
    (_event: any, draggedNode: Node) => {
      if (!draggedNode.parentId) return;

      setNodes((nds) => {
        const { updatedNodes, didExpand } = expandStageLiveWhileDragging(
          nds,
          draggedNode.parentId!,
          draggedNode,
        );
        if (didExpand) {
          setIsDirty(true);
        }
        return updatedNodes;
      });
    },
    [setNodes],
  );

  // Node Drag Stop: Auto-expand parent stage bounding box in 4 directions if child node dragged near boundary
  const onNodeDragStop = useCallback(
    (_event: any, draggedNode: Node) => {
      if (!draggedNode.parentId) return;

      setNodes((nds) => {
        const { updatedNodes, didExpand } = expandStageBoundsIfNeeded(
          nds,
          draggedNode.parentId!,
          draggedNode,
        );
        if (didExpand) {
          setIsDirty(true);
        }
        return updatedNodes;
      });
    },
    [setNodes],
  );

  // Window event listeners for node/stage updates
  useEffect(() => {
    const handleStageUpdate = (e: Event) => {
      const { stageId, name, executorKey, targetRunnerId } = (e as CustomEvent)
        .detail;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== stageId) return n;
          const prev = n.data as ScopeContainerNodeData;
          return {
            ...n,
            data: {
              ...prev,
              ...(name !== undefined ? { name } : {}),
              ...(executorKey !== undefined ? { executorKey } : {}),
              ...(targetRunnerId !== undefined ? { targetRunnerId } : {}),
            },
          };
        }),
      );
      setIsDirty(true);
    };

    const handleStageDelete = (e: Event) => {
      const { stageId } = (e as CustomEvent).detail;
      setNodes((nds) =>
        nds.filter((n) => n.id !== stageId && n.parentId !== stageId),
      );
      setEdges((eds) =>
        eds.filter((e) => e.source !== stageId && e.target !== stageId),
      );
      setIsDirty(true);
      toast.info("Stage deleted");
    };

    const handleCustomUpdate = (e: Event) => {
      const { nodeId, configValues } = (e as CustomEvent).detail;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            data: {
              ...n.data,
              configValues,
            },
          };
        }),
      );
      setIsDirty(true);
    };

    window.addEventListener("pipeline:update-stage", handleStageUpdate);
    window.addEventListener("pipeline:delete-stage", handleStageDelete);
    window.addEventListener("pipeline:update-node-config", handleCustomUpdate);

    return () => {
      window.removeEventListener("pipeline:update-stage", handleStageUpdate);
      window.removeEventListener("pipeline:delete-stage", handleStageDelete);
      window.removeEventListener(
        "pipeline:update-node-config",
        handleCustomUpdate,
      );
    };
  }, [setNodes, setEdges]);

  // Nodes deleted handler (Cascades child nodes of deleted stages)
  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      const filtered = deletedNodes.filter((n) => {
        const kindStr = String((n.data as any)?.kind || "").toLowerCase();
        const refIdStr = String((n.data as any)?.refId || "").toLowerCase();
        return kindStr !== "start" && refIdStr !== "start";
      });
      const deletedIds = new Set(filtered.map((n) => n.id));
      for (const n of nodes) {
        if (n.parentId && deletedIds.has(n.parentId)) {
          deletedIds.add(n.id);
        }
      }

      setNodes((nds) => nds.filter((n) => !deletedIds.has(n.id)));
      setEdges((eds) =>
        eds.filter(
          (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
        ),
      );
      setIsDirty(true);

      if (selectedNodeId && deletedIds.has(selectedNodeId)) {
        setSelectedNodeId(null);
      }
    },
    [nodes, selectedNodeId, setNodes, setEdges],
  );

  // Update Config for an unwired input pin
  const handleUpdateConfig = useCallback(
    (nodeId: string, pinId: string, value: any) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nodeData = n.data as any;
          const currentConfig = nodeData.configValues || {};
          const updatedConfig = { ...currentConfig, [pinId]: value };
          return {
            ...n,
            data: {
              ...n.data,
              configValues: updatedConfig,
            },
          };
        }),
      );
      setIsDirty(true);
    },
    [setNodes],
  );

  // Delete Node from inspector
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.filter((n) => n.id !== nodeId && n.parentId !== nodeId),
      );
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      setIsDirty(true);
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId, setNodes, setEdges],
  );

  // Add Action Node from Palette
  const handleSelectPaletteItem = useCallback(
    (
      item: NodePaletteItemDto,
      targetStage: ScopeContainerNodeData | null,
      flowCoordinates: { x: number; y: number },
    ) => {
      const newNodeId = crypto.randomUUID();
      const stageNode = targetStage
        ? nodes.find((n) => n.id === targetStage.stageId)
        : null;
      const position = stageNode
        ? {
            x: Math.max(30, flowCoordinates.x - stageNode.position.x),
            y: Math.max(60, flowCoordinates.y - stageNode.position.y),
          }
        : { x: flowCoordinates.x, y: flowCoordinates.y };

      const newNode: Node = {
        id: newNodeId,
        type: "pipelineNode",
        parentId: stageNode ? stageNode.id : undefined,
        position,
        data: {
          refId: item.key,
          kind: (item.source as PipelineNodeKind) || PipelineNodeKind.Tool,
          label: item.label,
          category: item.category,
          executor: item.executor,
          inputs: (item.inputs as PinDefinition[]) || [],
          outputs: (item.outputs as PinDefinition[]) || [],
          configValues: {},
          pipelineId: graph.id,
        } as CustomPipelineNodeData,
      };

      setNodes((nds) => {
        let baseNodes = [...nds, newNode];
        if (stageNode) {
          const { updatedNodes } = expandStageBoundsIfNeeded(
            baseNodes,
            stageNode.id,
            newNode,
          );
          baseNodes = updatedNodes;
        }
        return baseNodes;
      });

      setSelectedNodeId(newNodeId);
      setIsDirty(true);
    },
    [nodes, graph.id, setNodes],
  );

  // Create Stage from Palette
  const handleCreateStage = useCallback(
    (
      stageOption: StageCreationOption,
      flowCoordinates: { x: number; y: number },
    ) => {
      const stageId = crypto.randomUUID();
      const newStageNode: Node = {
        id: stageId,
        type: "scopeContainer",
        position: { x: flowCoordinates.x, y: flowCoordinates.y },
        style: { width: 520, height: 380 },
        data: {
          stageId,
          name: stageOption.name,
          kind: stageOption.kind,
          executorKey: stageOption.executorKey,
          targetRunnerId: null,
          pipelineId: graph.id,
        } as ScopeContainerNodeData,
      };

      // Add stage at the beginning of nodes array so it's a parent container
      setNodes((nds) => [newStageNode, ...nds]);
      setIsDirty(true);
      toast.success(`Created ${stageOption.name}`);
    },
    [graph.id, setNodes],
  );

  return {
    nodes,
    edges,
    isDirty,
    isSaving,
    selectedNodeId,
    selectedNode,
    setNodes,
    setEdges,
    setIsDirty,
    setSelectedNodeId,
    handleNodesChange,
    handleEdgesChange,
    onNodeDrag,
    onNodeDragStop,
    onNodesDelete,
    handleUpdateConfig,
    handleDeleteNode,
    handleSelectPaletteItem,
    handleCreateStage,
    parameters,
    setParameters,
    handleAddParameter,
    handleUpdateParameter,
    handleDeleteParameter,
  };
}
