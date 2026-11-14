import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import type {
  ExtendedPipelineGraphDto,
} from "../../../hooks/usePipelineGraph";
import { PipelineNodeKind } from "../../../hooks/usePipelineGraph";
import type { CustomPipelineNodeData } from "../nodes/types";
import type {
  NodePaletteItemDto,
  PinDefinition,
  PipelineParameterDto,
  StructDefinitionDto,
} from "@/gen/model";
import {
  applyNodeConfigUpdate,
  definitionKey,
  reconcileGraphWithDefinitions,
  resolveNodePinsFromDefinition,
} from "../../../nodeDefinitions";
import { useNodeDefinitionsMap } from "../NodeDefinitions";
import { toast } from "sonner";
import { isExecHandle } from "./canvasUtils";
import { usePipelineContractSync } from "./usePipelineContractSync";
import type { IPipelineStorageAdapter } from "../../../adapters/pipelineStorageAdapter";

interface UsePipelineDraftStateOptions {
  storage: IPipelineStorageAdapter;
}

export function usePipelineDraftState(
  graph: ExtendedPipelineGraphDto,
  structCatalogue: StructDefinitionDto[] | undefined,
  { storage }: UsePipelineDraftStateOptions
) {
  const definitions = useNodeDefinitionsMap();

  // 1. Initial Flat Nodes (No Stage Scoping) — hydrate static shapes from Palette (SSOT)
  const initialNodes: Node[] = useMemo(() => {
    return (graph.nodes || []).map((n) => {
      let nodeType = "pipelineNode";
      if (n.kind === PipelineNodeKind.Capsule) {
        nodeType = "capsuleNode";
      }

      const def = definitions.get(definitionKey(String(n.kind || ""), String(n.refId || "")));
      const resolved = resolveNodePinsFromDefinition(
        {
          kind: n.kind,
          label: n.label,
          executor: n.executor,
          category: n.category,
          inputs: n.inputs || [],
          outputs: n.outputs || [],
        },
        def
      );

      return {
        id: n.id,
        type: nodeType,
        parentId: undefined, // Flat DAG: no parent stages
        position: n.position || { x: 100, y: 100 },
        data: {
          refId: n.refId,
          kind: n.kind,
          label: resolved.label,
          category: resolved.category,
          executor: resolved.executor,
          inputs: resolved.inputs,
          outputs: resolved.outputs,
          configValues: n.configValues || {},
          metadata: n.metadata,
          fileAssets: n.fileAssets || [],
          pipelineId: graph.id,
        } as CustomPipelineNodeData,
      };
    });
  }, [graph.nodes, graph.id, definitions]);

  // 2. Initial Flat Edges
  const initialEdges: Edge[] = useMemo(() => {
    return (graph.edges || []).map((e) => {
      const sourceHandle = e.sourcePin || "out";
      const targetHandle = e.targetPin || "in";
      const isExec = isExecHandle(sourceHandle) || isExecHandle(targetHandle);

      return {
        id: e.id,
        source: e.sourceNodeId,
        sourceHandle: sourceHandle,
        target: e.targetNodeId,
        targetHandle: targetHandle,
        animated: !isExec,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isExec ? "currentColor" : "#38bdf8",
          width: 16,
          height: 16,
        },
        className: isExec ? "text-foreground" : "text-sky-400",
        type: "smoothstep",
        pathOptions: { borderRadius: 12 },
        style: isExec
          ? { stroke: "currentColor", strokeWidth: 3.5, strokeDasharray: "none" }
          : { stroke: "#38bdf8", strokeWidth: 2 },
      };
    });
  }, [graph.edges]);

  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, rawOnEdgesChange] = useEdgesState(initialEdges);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  // Sync initial graph when graph ID changes
  const prevGraphIdRef = useRef(graph.id);
  useEffect(() => {
    if (prevGraphIdRef.current !== graph.id) {
      prevGraphIdRef.current = graph.id;
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [graph.id, initialNodes, initialEdges, setNodes, setEdges]);

  // Reconcile live canvas nodes & edges whenever Palette definitions update (e.g. after Sync)
  const prevDefinitionsRef = useRef(definitions);
  useEffect(() => {
    if (prevDefinitionsRef.current === definitions) return;
    prevDefinitionsRef.current = definitions;
    if (definitions.size === 0) return;

    const result = reconcileGraphWithDefinitions(nodesRef.current, edgesRef.current, definitions);
    if (result.nodesChanged) {
      setNodes(result.nodes);
    }
    if (result.removedEdges.length > 0) {
      setEdges(result.edges);
      setIsDirty(true);
      toast.warning(
        `Palette updated: disconnected ${result.removedEdges.length} wire(s) whose pin no longer exists.`
      );
    }
  }, [definitions, setNodes, setEdges]);

  // Parameters State (Inputs / Outputs strictly, NO Variables)
  const [parameters, setParameters] = useState<PipelineParameterDto[]>(() => {
    return (graph.parameters || []).filter((p) => p.kind !== "Variable" && (p.kind as any) !== 3);
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isInitialMount = useRef(true);

  const onNodesChange = useCallback(
    (changes: any[]) => {
      rawOnNodesChange(changes);
      const shouldMarkDirty = changes.some(
        (c) =>
          c.type === "remove" ||
          (c.type === "position" && c.dragging === false)
      );
      if (shouldMarkDirty) {
        setIsDirty(true);
      }
    },
    [rawOnNodesChange]
  );

  const onEdgesChange = useCallback(
    (changes: any[]) => {
      rawOnEdgesChange(changes);
      if (changes.some((c) => c.type === "remove")) {
        setIsDirty(true);
      }
    },
    [rawOnEdgesChange]
  );

  // Tách riêng module Contract Sync
  usePipelineContractSync({
    parameters,
    setNodes,
    setEdges,
    setIsDirty,
    triggerType: graph.triggerType,
  });

  // Selected Node State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  // Auto-Save Debounced Strategy + Flush on Unmount
  const isAutoSavingRef = useRef(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const buildCurrentGraphDto = useCallback((): ExtendedPipelineGraphDto => {
    const g = graphRef.current;
    return {
      ...g,
      nodes: nodesRef.current.map((n) => {
        const data = (n.data as any) || {};
        return {
          id: n.id,
          refId: String(data.refId || n.id),
          label: data.label || n.id,
          kind: data.kind || PipelineNodeKind.Tool,
          category: data.category,
          executor: data.executor,
          position: n.position,
          configValues: data.configValues || {},
          inputs: data.inputs || [],
          outputs: data.outputs || [],
          metadata: data.metadata,
          fileAssets: data.fileAssets || [],
        };
      }),
      edges: edgesRef.current.map((e) => ({
        id: e.id,
        sourceNodeId: e.source,
        sourcePin: e.sourceHandle || "out",
        targetNodeId: e.target,
        targetPin: e.targetHandle || "in",
      })),
      parameters: parametersRef.current,
    };
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isDirty || isAutoSavingRef.current) return;

    const timer = setTimeout(async () => {
      if (isAutoSavingRef.current) return;
      isAutoSavingRef.current = true;
      setIsDirty(false);
      isDirtyRef.current = false;
      try {
        setIsSaving(true);
        const currentGraph = buildCurrentGraphDto();
        await storage.saveDraft(graph.id, currentGraph);
      } catch (err) {
        console.warn("[usePipelineDraftState] Auto-save error:", err);
        setIsDirty(true);
      } finally {
        isAutoSavingRef.current = false;
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [nodes, edges, parameters, isDirty, storage, graph, buildCurrentGraphDto]);

  // Flush any pending unsaved changes immediately when unmounting (e.g., switching tabs)
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && !isAutoSavingRef.current) {
        isDirtyRef.current = false;
        const currentGraph = buildCurrentGraphDto();
        void storageRef.current.saveDraft(graphRef.current.id, currentGraph);
      }
    };
  }, [buildCurrentGraphDto]);

  // Update Config for an input pin
  const handleUpdateConfig = useCallback(
    (nodeId: string, pinId: string, value: any) => {
      let didStructTypeChange = false;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const nodeData = n.data as any;
          const { configValues: updatedConfig, didChangeStructType } =
            applyNodeConfigUpdate(nodeData.configValues, pinId, value);
          didStructTypeChange = didChangeStructType;

          let nextInputs = nodeData.inputs;
          let nextOutputs = nodeData.outputs;

          if (didChangeStructType && value && structCatalogue) {
            const sDef = structCatalogue.find(
              (s) => s.structType?.toLowerCase() === String(value).trim().toLowerCase()
            );
            if (sDef) {
              nextInputs = [
                {
                  id: "Target",
                  label: `Target (${sDef.structType})`,
                  primitiveType: "EntityRef",
                  structType: sDef.structType,
                  isRequired: true,
                },
              ];
              nextOutputs = (sDef.outputPins as PinDefinition[]) || [];
            }
          }

          return {
            ...n,
            data: {
              ...n.data,
              configValues: updatedConfig,
              inputs: nextInputs,
              outputs: nextOutputs,
            },
          };
        })
      );

      if (didStructTypeChange) {
        setEdges((eds) =>
          eds.filter(
            (e) =>
              !(
                e.target === nodeId &&
                (e.targetHandle === "Target" || e.targetHandle === "target")
              )
          )
        );
      }

      setIsDirty(true);
    },
    [setNodes, setEdges, structCatalogue]
  );

  // Delete Node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
      setIsDirty(true);
    },
    [selectedNodeId, setEdges, setNodes]
  );

  // Rename Node Label
  const handleRenameNode = useCallback(
    (nodeId: string, newLabel: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const currentData = (n.data as any) || {};
          return {
            ...n,
            data: {
              ...currentData,
              label: newLabel,
              metadata: {
                ...currentData.metadata,
                label: newLabel,
              },
            },
          };
        })
      );
      setIsDirty(true);
    },
    [setNodes]
  );

  // Add Action Node from Palette directly onto Flat Canvas
  const handleSelectPaletteItem = useCallback(
    (
      item: NodePaletteItemDto,
      _targetStage: any,
      flowCoordinates: { x: number; y: number }
    ) => {
      const newNodeId = crypto.randomUUID();
      const initialOutputs = (item.outputs as PinDefinition[]) || [];

      const newNode: Node = {
        id: newNodeId,
        type: "pipelineNode",
        parentId: undefined, // Flat DAG
        position: { x: flowCoordinates.x, y: flowCoordinates.y },
        data: {
          refId: item.key,
          kind: (item.source as PipelineNodeKind) || PipelineNodeKind.Tool,
          label: item.label,
          category: item.category,
          executor: item.executor,
          inputs: (item.inputs as PinDefinition[]) || [],
          outputs: initialOutputs,
          configValues: {},
          pipelineId: graph.id,
        } as CustomPipelineNodeData,
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newNodeId);
      setIsDirty(true);
    },
    [graph.id, setNodes]
  );

  // Update Parameters (Inputs & Outputs only)
  const handleUpdateParameters = useCallback(
    (updatedParams: PipelineParameterDto[]) => {
      setParameters(
        updatedParams.filter(
          (p) => p.kind !== "Variable" && (p.kind as any) !== 3
        )
      );
      setIsDirty(true);
    },
    []
  );

  return {
    nodes,
    edges,
    parameters,
    selectedNodeId,
    selectedNode,
    isDirty,
    isSaving,
    setNodes,
    setEdges,
    setParameters: handleUpdateParameters,
    setSelectedNodeId,
    setIsDirty,
    onNodesChange,
    onEdgesChange,
    handleUpdateConfig,
    handleDeleteNode,
    handleRenameNode,
    handleSelectPaletteItem,
  };
}
