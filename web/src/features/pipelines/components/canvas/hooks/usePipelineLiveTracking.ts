import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import {
  usePipelineExecution,
  usePipelineExecutions,
} from "../../../hooks/usePipelineGraph";
import { usePipelineSignalR } from "../../../hooks/usePipelineSignalR";
import type { CustomPipelineNodeData } from "../CustomPipelineNode";

interface UsePipelineLiveTrackingArgs {
  pipelineId: string;
  setNodes: Dispatch<SetStateAction<Node[]>>;
}

export function usePipelineLiveTracking({
  pipelineId,
  setNodes,
}: UsePipelineLiveTrackingArgs) {
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerDefaultTab, setDrawerDefaultTab] = useState<"history" | "inspect" | "logs">("logs");

  const { data: executions } = usePipelineExecutions(pipelineId);
  const currentExecId = activeExecutionId || executions?.[0]?.id;
  const { data: currentExecution } = usePipelineExecution(currentExecId || undefined);
  const [liveNodeStatuses, setLiveNodeStatuses] = useState<
    Record<string, "idle" | "running" | "succeeded" | "failed">
  >({});

  usePipelineSignalR(pipelineId, {
    onExecutionStarted: (execId: string) => {
      setActiveExecutionId(execId);
      setLiveNodeStatuses({});
    },
    onNodeExecutionUpdated: (_execId: string, nodeId: string, status?: string | null) => {
      if (status) {
        const s = status.toLowerCase();
        const mappedStatus = s === "running" ? "running" : s === "failed" ? "failed" : "succeeded";
        setLiveNodeStatuses((prev) => ({
          ...prev,
          [nodeId]: mappedStatus,
        }));
      }
    },
    onExecutionFinished: () => {
      // Execution complete
    },
  });

  // Real-time synchronization of executionStatus into React Flow nodes
  useEffect(() => {
    if (!currentExecution) return;

    let stateObj: any = null;
    try {
      if (typeof currentExecution.executionState === "string") {
        stateObj = JSON.parse(currentExecution.executionState);
      } else {
        stateObj = currentExecution.executionState;
      }
    } catch {
      stateObj = null;
    }

    const nodeOutputs = stateObj?.NodeOutputs || {};
    const execStatus = Number(currentExecution.status);
    const isFailed = execStatus === 5;

    setNodes((currentNodes) => {
      return currentNodes.map((node) => {
        let newStatus: "idle" | "running" | "succeeded" | "failed" = "idle";
        let newError: string | null = null;

        if (nodeOutputs[node.id]) {
          newStatus = "succeeded";
        } else if (liveNodeStatuses[node.id]) {
          newStatus = liveNodeStatuses[node.id];
          if (newStatus === "failed") {
            newError = currentExecution.errorMessage;
          }
        } else if (isFailed && (node.data as CustomPipelineNodeData)?.executionStatus === "running") {
          newStatus = "failed";
          newError = currentExecution.errorMessage;
        }

        const prevData = node.data as CustomPipelineNodeData;
        if (prevData?.executionStatus === newStatus && prevData?.executionError === newError) {
          return node;
        }

        return {
          ...node,
          data: {
            ...prevData,
            executionStatus: newStatus,
            executionError: newError,
          },
        };
      });
    });
  }, [currentExecution, liveNodeStatuses, setNodes]);

  return {
    activeExecutionId,
    setActiveExecutionId,
    isDrawerOpen,
    setIsDrawerOpen,
    drawerDefaultTab,
    setDrawerDefaultTab,
    currentExecution,
  };
}
