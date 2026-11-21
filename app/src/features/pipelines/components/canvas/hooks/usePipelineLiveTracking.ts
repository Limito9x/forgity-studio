import { useState, useEffect, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePipelineExecution,
  usePipelineExecutions,
} from "../../../hooks/usePipelineGraph";
import { ExecutionStatus, mapExecutionStatus, usePipelineSignalR } from "../../../hooks/usePipelineSignalR";
import { toast } from "sonner";
import type { CustomPipelineNodeData } from "../nodes/types";

interface UsePipelineLiveTrackingArgs {
  pipelineId: string;
  isLocalMode?: boolean;
  setNodes: Dispatch<SetStateAction<Node[]>>;
}

export function usePipelineLiveTracking({
  pipelineId,
  isLocalMode = false,
  setNodes,
}: UsePipelineLiveTrackingArgs) {
  const queryClient = useQueryClient();
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerDefaultTab, setDrawerDefaultTab] = useState<
    "history" | "inspect" | "logs"
  >("logs");
  const [isExecutionRunning, setIsExecutionRunning] = useState<boolean>(false);
  const [activeRunningNodeId, setActiveRunningNodeId] = useState<string | null>(null);

  const [liveNodeStatuses, setLiveNodeStatuses] = useState<
    Record<string, "idle" | "waiting" | "running" | "succeeded" | "failed">
  >({});
  const [liveNodeProgress, setLiveNodeProgress] = useState<
    Record<string, { completed: number; total: number }>
  >({});
  const [liveNodeOutputs, setLiveNodeOutputs] = useState<
    Record<string, Record<string, any>>
  >({});
  const [liveNodeErrors, setLiveNodeErrors] = useState<
    Record<string, string | null>
  >({});
  const [localLogs, setLocalLogs] = useState<
    Array<{ runId: string; line: string }>
  >([]);
  const [localRunStatus, setLocalRunStatus] = useState<
    "idle" | "running" | "succeeded" | "failed"
  >("idle");
  const [localRunError, setLocalRunError] = useState<string | null>(null);

  const { data: executions } = usePipelineExecutions(isLocalMode ? undefined : pipelineId);
  const currentExecId = activeExecutionId || (isLocalMode ? undefined : executions?.[0]?.id);
  const { data: currentExecution } = usePipelineExecution(
    isLocalMode ? undefined : currentExecId || undefined,
  );

  // Sync isExecutionRunning based on currentExecution status if not already running via SignalR
  useEffect(() => {
    if (currentExecution) {
      const status = mapExecutionStatus(currentExecution.status);
      setIsExecutionRunning(
        status === ExecutionStatus.Pending || status === ExecutionStatus.Running ||
        status === ExecutionStatus.WaitingForRunner || status === ExecutionStatus.WaitingForSubPipeline,
      );
    }
  }, [currentExecution?.id, currentExecution?.status]);

  const clearActiveExecution = useCallback(() => {
    setActiveExecutionId(null);
    setActiveRunningNodeId(null);
    setLiveNodeStatuses({});
    setLiveNodeProgress({});
    setLiveNodeOutputs({});
    setLiveNodeErrors({});
    setLocalLogs([]);
    setLocalRunStatus("idle");
    setLocalRunError(null);
    setIsExecutionRunning(false);
  }, []);

  // Local Runner Event Listener (Tauri stdout JSON-lines -> Canvas Live State)
  useEffect(() => {
    if (!isLocalMode) return;
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let unlistenEvent: (() => void) | null = null;
    let unlistenLog: (() => void) | null = null;
    let disposed = false;

    import("@tauri-apps/api/event").then(async ({ listen }) => {
      if (disposed) return;

      unlistenEvent = await listen<any>("local-pipeline://event", (event) => {
        const payload = event.payload;
        if (!payload || !payload.type) return;

        switch (payload.type) {
          case "run_started": {
            // Only track top-level run_started (ignore sub-runs with _wave suffix if an active run is already tracked)
            if (activeExecutionIdRef.current && String(payload.run_id || "").includes("_wave")) {
              break;
            }
            isCancelledRef.current = false;
            activeExecutionIdRef.current = payload.run_id || null;
            setActiveExecutionId(payload.run_id || null);
            setActiveRunningNodeId(null);
            setLiveNodeStatuses({});
            setLiveNodeProgress({});
            setLiveNodeOutputs({});
            setLiveNodeErrors({});
            setLocalLogs([]);
            setLocalRunStatus("running");
            setLocalRunError(null);
            setIsExecutionRunning(true);
            setNodes((currentNodes) =>
              currentNodes.map((n) => ({
                ...n,
                data: {
                  ...(n.data as CustomPipelineNodeData),
                  executionStatus: "waiting",
                  executionProgress: null,
                  executionError: null,
                  executionOutputs: null,
                },
              }))
            );
            break;
          }
          case "node_started": {
            if (activeExecutionIdRef.current && payload.run_id && payload.run_id !== activeExecutionIdRef.current) {
              break;
            }
            const nid = payload.node_id;
            if (!nid) break;
            setLiveNodeStatuses((prev) => ({ ...prev, [nid]: "running" }));
            if (typeof payload.batch_total === "number" && payload.batch_total > 1) {
              setLiveNodeProgress((prev) => ({
                ...prev,
                [nid]: { completed: payload.batch_index ?? 0, total: payload.batch_total },
              }));
            }
            setActiveRunningNodeId(nid);
            break;
          }
          case "node_progress": {
            if (activeExecutionIdRef.current && payload.run_id && payload.run_id !== activeExecutionIdRef.current) {
              break;
            }
            const nid = payload.node_id;
            if (!nid) break;
            const s = String(payload.status || "").toLowerCase();
            const mapped: "waiting" | "running" | "succeeded" | "failed" =
              s === "failed"
                ? "failed"
                : s === "succeeded"
                  ? "succeeded"
                  : s === "waiting" || s === "free"
                    ? "waiting"
                    : "running";
            setLiveNodeStatuses((prev) => ({ ...prev, [nid]: mapped }));
            if (typeof payload.completed === "number" && typeof payload.total === "number") {
              setLiveNodeProgress((prev) => ({
                ...prev,
                [nid]: { completed: payload.completed, total: payload.total },
              }));
            }
            if (payload.outputs) {
              setLiveNodeOutputs((prev) => ({ ...prev, [nid]: payload.outputs }));
            }
            if (payload.error_message) {
              setLiveNodeErrors((prev) => ({ ...prev, [nid]: payload.error_message }));
            }
            break;
          }
          case "node_completed": {
            if (activeExecutionIdRef.current && payload.run_id && payload.run_id !== activeExecutionIdRef.current) {
              break;
            }
            const nid = payload.node_id;
            if (!nid) break;
            const ok = Boolean(payload.succeeded);
            setLiveNodeStatuses((prev) => ({
              ...prev,
              [nid]: ok ? "succeeded" : "failed",
            }));
            setActiveRunningNodeId((prev) => (prev === nid ? null : prev));
            if (payload.outputs) {
              setLiveNodeOutputs((prev) => ({ ...prev, [nid]: payload.outputs }));
            }
            if (ok) {
              setLiveNodeErrors((prev) => {
                const next = { ...prev };
                delete next[nid];
                return next;
              });
            } else if (payload.error_message) {
              setLiveNodeErrors((prev) => ({
                ...prev,
                [nid]: payload.error_message,
              }));
            }
            break;
          }
          case "run_completed": {
            if (activeExecutionIdRef.current && payload.run_id && payload.run_id !== activeExecutionIdRef.current) {
              break;
            }
            activeExecutionIdRef.current = null;
            setIsExecutionRunning(false);
            setActiveRunningNodeId(null);
            const ok = Boolean(payload.succeeded);
            setLocalRunStatus(ok ? "succeeded" : "failed");
            void queryClient.invalidateQueries({ queryKey: ["/api/templates/my-library"] });
            if (ok) {
              setLocalRunError(null);
              toast.success("Local Pipeline Succeeded");
            } else {
              const errMsg = payload.error_message || "Local pipeline execution failed";
              setLocalRunError(errMsg);
              setLiveNodeStatuses((prev) => {
                const next = { ...prev };
                for (const k of Object.keys(next)) {
                  if (next[k] === "running" || next[k] === "waiting") {
                    next[k] = "idle";
                  }
                }
                return next;
              });
              setLiveNodeErrors((prev) => ({
                ...prev,
                __run__: errMsg,
              }));
              toast.error("Local Pipeline Failed", { description: errMsg });
              setDrawerDefaultTab("logs");
              setIsDrawerOpen(true);
            }
            break;
          }
        }
      });

      unlistenLog = await listen<{ runId: string; line: string }>(
        "local-pipeline://log",
        (event) => {
          const item = event.payload;
          if (!item?.line) return;
          setLocalLogs((prev) => {
            const next = [...prev, item];
            return next.length > 500 ? next.slice(next.length - 500) : next;
          });
        },
      );
    });

    return () => {
      disposed = true;
      unlistenEvent?.();
      unlistenLog?.();
    };
  }, [isLocalMode]);

  const isCancelledRef = useRef(false);
  const activeExecutionIdRef = useRef<string | null>(null);

  usePipelineSignalR(pipelineId, {
    onExecutionStarted: (execId: string) => {
      isCancelledRef.current = false;
      setActiveExecutionId(execId);
      setActiveRunningNodeId(null);
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
      if (isCancelledRef.current) return;
      if (status) {
        const s = status.toLowerCase();
        const mappedStatus =
          s === "running" ? "running" : s === "failed" ? "failed" : "succeeded";
        setLiveNodeStatuses((prev) => ({
          ...prev,
          [nodeId]: mappedStatus,
        }));
        if (mappedStatus === "running") {
          setActiveRunningNodeId(nodeId);
        } else {
          setActiveRunningNodeId((prev) => (prev === nodeId ? null : prev));
        }

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
      setActiveRunningNodeId(null);
      const isFail =
        status === ExecutionStatus.Failed ||
        String(status).toLowerCase() === "failed" ||
        Number(status) === 5;
      const isCancelled =
        status === ExecutionStatus.Cancelled ||
        String(status).toLowerCase() === "cancelled" ||
        Number(status) === 6;

      if (isCancelled) {
        isCancelledRef.current = true;
        setLiveNodeStatuses((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (next[k] === "running") {
              delete next[k];
            }
          }
          return next;
        });
      } else if (isFail) {
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
              if ((liveNodeStatuses[k] === "running" || liveNodeStatuses[k] === "failed") && !next[k]) {
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
    const isFailed = currentExecution?.status === ExecutionStatus.Failed;

    setNodes((currentNodes) => {
      let hasChanges = false;
      const updated = currentNodes.map((node) => {
        let newStatus: "idle" | "waiting" | "running" | "succeeded" | "failed" = "idle";
        let newError: string | null = null;
        const newProgress = liveNodeProgress[node.id] || null;
        const newOutputs =
          liveNodeOutputs[node.id] || nodeOutputs[node.id] || null;

        if (liveNodeStatuses[node.id]) {
          newStatus = liveNodeStatuses[node.id];
          newError =
            liveNodeErrors[node.id] ||
            (newStatus === "failed"
              ? (currentExecution?.errorMessage ?? null)
              : null);
        } else if (isLocalMode && localRunStatus === "running") {
          newStatus = "waiting";
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
          JSON.stringify(prevData?.executionProgress) === JSON.stringify(newProgress) &&
          JSON.stringify(prevData?.executionOutputs) ===
            JSON.stringify(newOutputs)
        ) {
          return node;
        }

        hasChanges = true;
        return {
          ...node,
          data: {
            ...prevData,
            executionStatus: newStatus,
            executionProgress: newProgress,
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
    liveNodeProgress,
    liveNodeOutputs,
    liveNodeErrors,
    isLocalMode,
    localRunStatus,
    setNodes,
  ]);

  return {
    activeExecutionId,
    setActiveExecutionId,
    clearActiveExecution,
    isExecutionRunning,
    activeRunningNodeId,
    isDrawerOpen,
    setIsDrawerOpen,
    drawerDefaultTab,
    setDrawerDefaultTab,
    currentExecution,
    liveNodeStatuses,
    liveNodeOutputs,
    liveNodeErrors,
    localLogs,
    localRunStatus,
    localRunError,
  };
}
