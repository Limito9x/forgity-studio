import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import {
  usePipelineExecution,
  usePipelineExecutions,
} from "../../../hooks/usePipelineGraph";
import { usePipelineSignalR } from "../../../hooks/usePipelineSignalR";
import { ExecutionStatus } from "@/gen/model/executionStatus";
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
  const [isExecutionRunning, setIsExecutionRunning] = useState<boolean>(false);

  const [liveNodeStatuses, setLiveNodeStatuses] = useState<
    Record<string, "idle" | "running" | "succeeded" | "failed">
  >({});
  const [liveNodeOutputs, setLiveNodeOutputs] = useState<
    Record<string, Record<string, any>>
  >({});
  const [liveNodeErrors, setLiveNodeErrors] = useState<
    Record<string, string | null>
  >({});

  const { data: executions } = usePipelineExecutions(pipelineId);
  const currentExecId = activeExecutionId || executions?.[0]?.id;
  const { data: currentExecution } = usePipelineExecution(currentExecId || undefined);

  // Sync isExecutionRunning based on currentExecution status if not already running via SignalR
  useEffect(() => {
    if (currentExecution) {
      const s = Number(currentExecution.status);
      if (s === 2 || s === 3) {
        setIsExecutionRunning(true);
      } else if (s === 4 || s === 5 || s === 6) {
        setIsExecutionRunning(false);
      }
    }
  }, [currentExecution?.status]);

  const clearActiveExecution = useCallback(() => {
    setActiveExecutionId(null);
    setLiveNodeStatuses({});
    setLiveNodeOutputs({});
    setLiveNodeErrors({});
    setIsExecutionRunning(false);
  }, []);

  usePipelineSignalR(pipelineId, {
    onExecutionStarted: (execId: string) => {
      setActiveExecutionId(execId);
      setLiveNodeStatuses({});
      setLiveNodeOutputs({});
      setLiveNodeErrors({});
      setIsExecutionRunning(true);
    },
    onNodeExecutionUpdated: (
      _execId: string,
      nodeId: string,
      status?: string | null,
      outputs?: Record<string, any>,
      errorMessage?: string | null,
    ) => {
      if (status) {
        const s = status.toLowerCase();
        const mappedStatus = s === "running" ? "running" : s === "failed" ? "failed" : "succeeded";
        setLiveNodeStatuses((prev) => ({
          ...prev,
          [nodeId]: mappedStatus,
        }));
        if (outputs) {
          setLiveNodeOutputs((prev) => ({
            ...prev,
            [nodeId]: outputs,
          }));
        }
        if (mappedStatus === "succeeded") {
          setLiveNodeErrors((prev) => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
        } else if (errorMessage) {
          setLiveNodeErrors((prev) => ({
            ...prev,
            [nodeId]: errorMessage,
          }));
        }
      }
    },
    onExecutionFinished: (
      _execId: string,
      status?: ExecutionStatus,
      errorMessage?: string,
    ) => {
      setIsExecutionRunning(false);
      const isFail =
        status === ExecutionStatus.Failed ||
        String(status).toLowerCase() === "failed" ||
        Number(status) === 5;

      if (isFail) {
        setLiveNodeStatuses((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (next[k] === "running") {
              next[k] = "failed";
            }
          }
          return next;
        });
        if (errorMessage) {
          setLiveNodeErrors((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
              if (liveNodeStatuses[k] === "failed" && !next[k]) {
                next[k] = errorMessage;
              }
            }
            return next;
          });
        }
      }
    },
  });

  // Real-time synchronization of executionStatus into React Flow nodes
  useEffect(() => {
    // If not actively viewing an execution and no live statuses exist -> reset nodes to idle (Draft Mode)
    if (!activeExecutionId && Object.keys(liveNodeStatuses).length === 0) {
      setNodes((currentNodes) => {
        let hasChanges = false;
        const updated = currentNodes.map((node) => {
          const prevData = node.data as CustomPipelineNodeData;
          if (
            prevData?.executionStatus &&
            prevData.executionStatus !== "idle"
          ) {
            hasChanges = true;
            return {
              ...node,
              data: {
                ...prevData,
                executionStatus: "idle",
                executionError: null,
                executionOutputs: null,
              },
            };
          }
          return node;
        });
        return hasChanges ? updated : currentNodes;
      });
      return;
    }

    let stateObj: any = null;
    try {
      if (typeof currentExecution?.executionState === "string") {
        stateObj = JSON.parse(currentExecution.executionState);
      } else {
        stateObj = currentExecution?.executionState;
      }
    } catch {
      stateObj = null;
    }

    const nodeOutputs = stateObj?.NodeOutputs || {};
    const execStatus = Number(currentExecution?.status);
    const isFailed = execStatus === 5;

    setNodes((currentNodes) => {
      let hasChanges = false;
      const updated = currentNodes.map((node) => {
        let newStatus: "idle" | "running" | "succeeded" | "failed" = "idle";
        let newError: string | null = null;
        const newOutputs =
          liveNodeOutputs[node.id] || nodeOutputs[node.id] || null;

        if (liveNodeStatuses[node.id]) {
          newStatus = liveNodeStatuses[node.id];
          newError =
            liveNodeErrors[node.id] ||
            (newStatus === "failed" ? currentExecution?.errorMessage ?? null : null);
        } else if (nodeOutputs[node.id]) {
          newStatus = "succeeded";
        } else if (
          isFailed &&
          (node.data as CustomPipelineNodeData)?.executionStatus === "running"
        ) {
          newStatus = "failed";
          newError = currentExecution?.errorMessage || "Execution failed";
        }

        const prevData = node.data as CustomPipelineNodeData;
        if (
          prevData?.executionStatus === newStatus &&
          prevData?.executionError === newError &&
          JSON.stringify(prevData?.executionOutputs) === JSON.stringify(newOutputs)
        ) {
          return node;
        }

        hasChanges = true;
        return {
          ...node,
          data: {
            ...prevData,
            executionStatus: newStatus,
            executionError: newError,
            executionOutputs: newOutputs,
          },
        };
      });

      return hasChanges ? updated : currentNodes;
    });
  }, [
    activeExecutionId,
    currentExecution,
    liveNodeStatuses,
    liveNodeOutputs,
    liveNodeErrors,
    setNodes,
  ]);

  return {
    activeExecutionId,
    setActiveExecutionId,
    clearActiveExecution,
    isExecutionRunning,
    isDrawerOpen,
    setIsDrawerOpen,
    drawerDefaultTab,
    setDrawerDefaultTab,
    currentExecution,
    liveNodeStatuses,
    liveNodeOutputs,
    liveNodeErrors,
  };
}
