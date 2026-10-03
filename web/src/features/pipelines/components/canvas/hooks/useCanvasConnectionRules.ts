import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { addEdge, MarkerType } from "@xyflow/react";
import type { Connection, Edge, Node } from "@xyflow/react";
import { toast } from "sonner";
import { isExecHandle, isExecEdge } from "./canvasUtils";
import { isExecPin } from "../nodes/types";
import { getStructPins } from "../constants/structPins";

interface UseCanvasConnectionRulesArgs {
  nodes: Node[];
  edges: Edge[];
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setIsDirty: (dirty: boolean) => void;
}

export function useCanvasConnectionRules({
  nodes,
  edges,
  setEdges,
  setNodes,
  setIsDirty,
}: UseCanvasConnectionRulesArgs) {
  // Two-tier Strict Connection Validation
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      // 1. Cannot connect to self
      if (connection.source === connection.target) return false;
      if (!connection.sourceHandle || !connection.targetHandle) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      // 2. Stage-to-Stage connection (Scope boundary exec wires) or Runner binding pin
      const isSourceStage = sourceNode.type === "scopeContainer";
      const isTargetStage = targetNode.type === "scopeContainer";
      if (isSourceStage || isTargetStage) {
        // Allow data connection to ScopeContainer's runner pin
        if (isTargetStage && connection.targetHandle === "runner") {
          return true;
        }

        return (
          isSourceStage &&
          isTargetStage &&
          connection.sourceHandle === "exec_out" &&
          connection.targetHandle === "exec_in"
        );
      }

      // 3. Exec Flow between nodes (can cross scopes freely)
      const isSourceExec = isExecHandle(connection.sourceHandle);
      const isTargetExec = isExecHandle(connection.targetHandle);
      if (isSourceExec || isTargetExec) {
        if (!isSourceExec || !isTargetExec) return false;
        return true;
      }

      // 4. Data Flow (can cross scopes freely)
      const targetPin = (targetNode.data as any)?.inputs?.find(
        (p: any) => p.id === connection.targetHandle
      );
      const isArray = targetPin?.cardinality === 1 || targetPin?.cardinality === "Array";

      if (!isArray) {
        const alreadyConnected = edges.some(
          (e) => e.target === connection.target && e.targetHandle === connection.targetHandle
        );
        if (alreadyConnected) return false;
      }

      return true;
    },
    [nodes, edges]
  );

  // Connect Handler (Wired an edge in local state)
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || !params.sourceHandle || !params.targetHandle) return;

      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      const isRunnerEdge = targetNode?.type === "scopeContainer" && params.targetHandle === "runner";
      const isStageEdge = sourceNode?.type === "scopeContainer" && targetNode?.type === "scopeContainer";
      const isExec = !isRunnerEdge && (isStageEdge || isExecEdge(params.sourceHandle, params.targetHandle));

      const newEdgeId = crypto.randomUUID();
      setEdges((eds) => {
        // If connecting ExecOut (1-to-1 rule) or Runner pin (1-to-1 rule), remove existing edge
        const filtered = isExec
          ? eds.filter((e) => !(e.source === params.source && e.sourceHandle === params.sourceHandle))
          : isRunnerEdge
          ? eds.filter((e) => !(e.target === params.target && e.targetHandle === "runner"))
          : eds;

        return addEdge(
          {
            ...params,
            id: newEdgeId,
            animated: !isExec,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isExec ? "currentColor" : isRunnerEdge ? "#f59e0b" : "#38bdf8",
              width: 16,
              height: 16,
            },
            className: isExec ? "text-foreground" : isRunnerEdge ? "text-amber-500" : "text-sky-400",
            style: isExec
              ? { stroke: "currentColor", strokeWidth: 3.5, strokeDasharray: "none" }
              : isRunnerEdge
              ? { stroke: "#f59e0b", strokeWidth: 2.5 }
              : { stroke: "#38bdf8", strokeWidth: 2 },
            data: isStageEdge ? { isStageEdge: true } : isRunnerEdge ? { isRunnerEdge: true } : undefined,
          },
          filtered
        );
      });
      setIsDirty(true);

      // Auto-Infer Struct Type for BreakStruct node when wired to Target pin
      if (!isStageEdge && targetNode) {
        const isTargetBreakStruct = (targetNode.data as any)?.refId?.toLowerCase() === "breakstruct";
        if (isTargetBreakStruct && (params.targetHandle === "Target" || params.targetHandle === "target")) {
          const sourcePins = (sourceNode?.data as any)?.outputs || [];
          const sourcePin = sourcePins.find((p: any) => p.id === params.sourceHandle);
          const pinText = `${sourcePin?.id || ""} ${sourcePin?.label || ""} ${(sourcePin?.metadata as any) || ""}`.toLowerCase();

          let inferredStructType = "Resource";
          if (pinText.includes("inspection")) inferredStructType = "Inspection";
          else if (pinText.includes("repository") || pinText.includes("workspace")) inferredStructType = "Repository";
          else if (pinText.includes("taggedasset")) inferredStructType = "TaggedAsset";
          else if (pinText.includes("resource")) inferredStructType = "Resource";
          else if (sourcePin?.metadata && typeof sourcePin.metadata === "string" && sourcePin.metadata.trim()) {
            inferredStructType = sourcePin.metadata.trim();
          }

          const dynamicPins = getStructPins(inferredStructType);

          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== params.target) return n;
              const nodeData = n.data as any;
              const currentConfig = nodeData.configValues || {};
              const updatedConfig = { ...currentConfig, StructType: inferredStructType };
              const execOutputs = (nodeData.outputs || []).filter(isExecPin);
              const nextOutputs = dynamicPins.length > 0 ? [...execOutputs, ...dynamicPins] : nodeData.outputs;

              return {
                ...n,
                data: {
                  ...n.data,
                  configValues: updatedConfig,
                  outputs: nextOutputs,
                },
              };
            })
          );
        }
      }
    },
    [nodes, setEdges, setNodes, setIsDirty]
  );

  // Edges deleted handler
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id));
      setEdges((eds) => eds.filter((e) => !deletedIds.has(e.id)));
      setIsDirty(true);
      toast.info("Connection deleted");
    },
    [setEdges, setIsDirty]
  );

  // Right-click on Edge to immediately delete the connection wire
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      setIsDirty(true);
      toast.info("Connection deleted");
    },
    [setEdges, setIsDirty]
  );

  return {
    isValidConnection,
    onConnect,
    onEdgesDelete,
    onEdgeContextMenu,
  };
}
