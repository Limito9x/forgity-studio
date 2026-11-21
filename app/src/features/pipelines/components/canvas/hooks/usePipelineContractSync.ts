import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { PipelineParameterDto, PinDefinition } from "@/features/pipelines/types/pipelineGraphTypes";
import {
  getPipelineParameterPinId,
  pipelineParameterToPin,
} from "../../../adapters/pipelineParameterPins";
import type { CustomPipelineNodeData } from "../nodes/types";

interface UsePipelineContractSyncOptions {
  parameters: PipelineParameterDto[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setIsDirty: (dirty: boolean) => void;
  triggerType?: any;
}

/**
 * Hook chuyên trách đồng bộ Hợp đồng Pipeline (Single Source of Truth):
 * - Pipeline Inputs <---> Start Node Output Data Pins (kèm chân exec_out)
 * - Pipeline Outputs <---> Return Node Input Data Pins (kèm chân exec_in)
 * - Xóa bỏ hoàn toàn khái niệm Variable Blackboard.
 */
export function usePipelineContractSync({
  parameters,
  setNodes,
  setEdges,
  setIsDirty,
  triggerType,
}: UsePipelineContractSyncOptions) {
  const prevParamsSignatureRef = useRef<string>("");

  useEffect(() => {
    // Lọc Input và Output thuần túy (không chấp nhận Variable)
    const inputParams = (parameters || []).filter(
      (p) => p.kind === "Input" || (p.kind as any) === 1,
    );
    const outputParams = (parameters || []).filter(
      (p) => p.kind === "Output" || (p.kind as any) === 2,
    );

    const sig = JSON.stringify({ inputParams, outputParams, triggerType });
    if (prevParamsSignatureRef.current === sig) {
      return;
    }
    prevParamsSignatureRef.current = sig;

    const isEventTrigger =
      (triggerType as any) === 1 ||
      (triggerType as any) === 2 ||
      (triggerType as any) === "OnResourceCreated" ||
      (triggerType as any) === "OnResourceVersionUpdated";

    setNodes((currentNodes) => {
      let hasChanges = false;

      const updated = currentNodes.map((node) => {
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
          // 1. Start Node Output Pins
          const startOutputs: PinDefinition[] = [
            {
              id: "exec_out",
              name: "Start",
              direction: "Output",
              label: "Start",
              kind: "Exec",
              isRequired: false,
            },
          ];

          // Event trigger inputs if triggered by resource
          if (isEventTrigger) {
            startOutputs.push(
              {
                id: "resources",
                name: "Resources[]",
                direction: "Output",
                label: "Resources[]",
                kind: "Data",
                primitiveType: "Array" as any,
                cardinality: "Array" as any,
                isRequired: false,
              },
              {
                id: "repository",
                name: "Repository",
                direction: "Output",
                label: "Repository",
                kind: "Data",
                primitiveType: "EntityRef" as any,
                isRequired: false,
              },
            );
          }

          // Ghép các tham số Input của Pipeline thành Data Pins đầu ra của Start
          for (const p of inputParams) {
            startOutputs.push(pipelineParameterToPin(p, "Output"));
          }

          hasChanges = true;
          return {
            ...node,
            data: {
              ...nodeData,
              outputs: startOutputs,
            },
          };
        }

        if (isReturn) {
          // 2. Return Node Input Pins
          const returnInputs: PinDefinition[] = [
            {
              id: "exec_in",
              name: "Exec",
              direction: "Input",
              label: "Exec",
              kind: "Exec",
              isRequired: false,
            },
          ];

          // Ghép các tham số Output của Pipeline thành Data Pins đầu vào của Return
          for (const p of outputParams) {
            returnInputs.push(pipelineParameterToPin(p, "Input"));
          }

          hasChanges = true;
          return {
            ...node,
            data: {
              ...nodeData,
              inputs: returnInputs,
            },
          };
        }

        return node;
      });

      if (hasChanges) {
        setIsDirty(true);
      }
      return updated;
    });

    // Tự động dọn các edge nối vào các chân tham số đã bị xóa khỏi Input/Output
    const validStartOutputIds = new Set([
      "exec_out",
      "resources",
      "repository",
      ...inputParams.map(getPipelineParameterPinId),
    ]);
    const validReturnInputIds = new Set([
      "exec_in",
      ...outputParams.map(getPipelineParameterPinId),
    ]);

    setEdges((currentEdges) =>
      currentEdges.filter((edge) => {
        const isFromStart = edge.source.toLowerCase().includes("start");
        const isToReturn = edge.target.toLowerCase().includes("return");

        if (
          isFromStart &&
          edge.sourceHandle &&
          !validStartOutputIds.has(edge.sourceHandle)
        ) {
          return false;
        }
        if (
          isToReturn &&
          edge.targetHandle &&
          !validReturnInputIds.has(edge.targetHandle)
        ) {
          return false;
        }
        return true;
      }),
    );
  }, [parameters, triggerType, setNodes, setEdges, setIsDirty]);
}
