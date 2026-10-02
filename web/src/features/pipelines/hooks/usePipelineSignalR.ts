import { useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPipelineExecutionsQueryKey,
  getGetPipelineExecutionQueryKey,
  getGetNodeExecutionsQueryKey,
} from "@/gen/endpoints/pipelines/pipelines";
import { ExecutionStatus } from "@/gen/model/executionStatus";
import type { PipelineExecutionDto, NodeExecutionDto } from "@/gen/model";

interface PipelineExecutionStartedPayload {
  executionId: string;
  pipelineId: string;
  status: number | string;
  startedAt?: string;
}

interface PipelineNodeExecutionUpdatedPayload {
  executionId: string;
  pipelineId: string;
  nodeId: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string | null;
  outputs?: Record<string, any>;
}

interface PipelineExecutionFinishedPayload {
  executionId: string;
  pipelineId: string;
  status: number | string;
  finishedAt?: string;
  errorMessage?: string;
  executionState?: any;
}

function mapExecutionStatus(status: number | string): ExecutionStatus {
  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (s === "pending") return ExecutionStatus.Pending;
    if (s === "running") return ExecutionStatus.Running;
    if (s === "waitingforrunner" || s === "waitingforagent") return ExecutionStatus.WaitingForRunner;
    if (s === "succeeded" || s === "success") return ExecutionStatus.Succeeded;
    if (s === "failed" || s === "fail") return ExecutionStatus.Failed;
    if (s === "cancelled") return ExecutionStatus.Cancelled;
  }
  switch (Number(status)) {
    case 1:
      return ExecutionStatus.Pending;
    case 2:
      return ExecutionStatus.Running;
    case 3:
      return ExecutionStatus.WaitingForRunner;
    case 4:
      return ExecutionStatus.Succeeded;
    case 5:
      return ExecutionStatus.Failed;
    case 6:
      return ExecutionStatus.Cancelled;
    default:
      return ExecutionStatus.Pending;
  }
}

export function usePipelineSignalR(
  pipelineId?: string,
  callbacks?: {
    onExecutionStarted?: (executionId: string) => void;
    onNodeExecutionUpdated?: (executionId: string, nodeId: string, status?: string) => void;
    onExecutionFinished?: (executionId: string) => void;
  }
) {
  const queryClient = useQueryClient();
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!pipelineId) return;

    const baseUrl = (import.meta.env.VITE_API_URL as string) || "";
    const hubUrl = `${baseUrl.replace(/\/+$/, "")}/hubs/pipeline-executions`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connectionRef.current = connection;

    // 1. Pipeline Execution Started -> Direct Cache Injection
    connection.on("PipelineExecutionStarted", (data: PipelineExecutionStartedPayload) => {
      const initialStatus = mapExecutionStatus(data.status);
      const startedAt = data.startedAt ?? new Date().toISOString();

      // Upsert into executions list cache
      queryClient.setQueryData<PipelineExecutionDto[]>(
        getGetPipelineExecutionsQueryKey(data.pipelineId),
        (old) => {
          const newExec: PipelineExecutionDto = {
            id: data.executionId,
            pipelineId: data.pipelineId,
            agentId: "",
            status: initialStatus,
            startedAt,
            finishedAt: null,
            errorMessage: null,
            nextNodeIndex: 0,
            currentBatchId: null,
            executionState: null as any,
          };
          if (!old) return [newExec];
          const exists = old.some((e) => e.id === data.executionId);
          if (exists) {
            return old.map((e) =>
              e.id === data.executionId ? { ...e, status: initialStatus, startedAt } : e
            );
          }
          return [newExec, ...old];
        }
      );

      // Inject single execution entry cache
      queryClient.setQueryData<PipelineExecutionDto>(
        getGetPipelineExecutionQueryKey(data.executionId),
        (old) => {
          if (old) {
            return { ...old, status: initialStatus, startedAt };
          }
          return {
            id: data.executionId,
            pipelineId: data.pipelineId,
            agentId: "",
            status: initialStatus,
            startedAt,
            finishedAt: null,
            errorMessage: null,
            nextNodeIndex: 0,
            currentBatchId: null,
            executionState: null as any,
          };
        }
      );

      // Reset node executions cache for this execution
      queryClient.setQueryData<NodeExecutionDto[]>(
        getGetNodeExecutionsQueryKey(data.executionId),
        () => []
      );

      callbacks?.onExecutionStarted?.(data.executionId);
    });

    // 2. Node Execution Updated -> Direct In-Memory Injection
    connection.on("PipelineNodeExecutionUpdated", (data: PipelineNodeExecutionUpdatedPayload) => {
      const mappedStatus = mapExecutionStatus(data.status || "Running");

      // Inject into NodeExecutions list cache
      queryClient.setQueryData<NodeExecutionDto[]>(
        getGetNodeExecutionsQueryKey(data.executionId),
        (old) => {
          const items = old ? [...old] : [];
          const idx = items.findIndex((n) => n.pipelineNodeId === data.nodeId);
          if (idx >= 0) {
            items[idx] = {
              ...items[idx],
              status: mappedStatus,
              startedAt: data.startedAt ?? items[idx].startedAt,
              finishedAt: data.finishedAt ?? items[idx].finishedAt,
              errorMessage: data.errorMessage !== undefined ? data.errorMessage : items[idx].errorMessage,
              output: data.outputs !== undefined ? (data.outputs as any) : items[idx].output,
            };
          } else {
            items.push({
              id: data.nodeId,
              pipelineExecutionId: data.executionId,
              pipelineNodeId: data.nodeId,
              status: mappedStatus,
              startedAt: data.startedAt ?? new Date().toISOString(),
              finishedAt: data.finishedAt ?? null,
              errorMessage: data.errorMessage ?? null,
              output: (data.outputs as any) ?? null,
              log: null as any,
            });
          }
          return items;
        }
      );

      // If node provided outputs, merge directly into executionState.NodeOutputs cache
      if (data.outputs) {
        queryClient.setQueryData<PipelineExecutionDto>(
          getGetPipelineExecutionQueryKey(data.executionId),
          (old) => {
            if (!old) return old;
            let parsedState: any = null;
            try {
              parsedState =
                typeof old.executionState === "string"
                  ? JSON.parse(old.executionState)
                  : { ...old.executionState };
            } catch {
              parsedState = {};
            }
            if (!parsedState) parsedState = {};
            if (!parsedState.NodeOutputs) parsedState.NodeOutputs = {};
            parsedState.NodeOutputs[data.nodeId] = data.outputs;

            return {
              ...old,
              executionState: parsedState,
            };
          }
        );
      }

      callbacks?.onNodeExecutionUpdated?.(data.executionId, data.nodeId, data.status);
    });

    // 3. Pipeline Execution Finished -> Direct Cache Finalization
    connection.on("PipelineExecutionFinished", (data: PipelineExecutionFinishedPayload) => {
      const finalStatus = mapExecutionStatus(data.status);
      const finishedAt = data.finishedAt ?? new Date().toISOString();

      // Update single execution entry
      queryClient.setQueryData<PipelineExecutionDto>(
        getGetPipelineExecutionQueryKey(data.executionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            status: finalStatus,
            finishedAt,
            errorMessage: data.errorMessage ?? old.errorMessage,
            executionState: data.executionState ?? old.executionState,
          };
        }
      );

      // Update executions list
      queryClient.setQueryData<PipelineExecutionDto[]>(
        getGetPipelineExecutionsQueryKey(data.pipelineId),
        (old) => {
          if (!old) return old;
          return old.map((exec) =>
            exec.id === data.executionId
              ? {
                  ...exec,
                  status: finalStatus,
                  finishedAt,
                  errorMessage: data.errorMessage ?? exec.errorMessage,
                  executionState: data.executionState ?? exec.executionState,
                }
              : exec
          );
        }
      );

      // If execution failed, mark any still-running nodes as failed
      if (finalStatus === ExecutionStatus.Failed) {
        queryClient.setQueryData<NodeExecutionDto[]>(
          getGetNodeExecutionsQueryKey(data.executionId),
          (old) => {
            if (!old) return old;
            return old.map((n) =>
              n.status === ExecutionStatus.Running
                ? {
                    ...n,
                    status: ExecutionStatus.Failed,
                    errorMessage: data.errorMessage ?? n.errorMessage,
                    finishedAt,
                  }
                : n
            );
          }
        );
      }

      callbacks?.onExecutionFinished?.(data.executionId);
    });

    async function startConnection() {
      try {
        await connection.start();
        await connection.invoke("JoinPipeline", pipelineId);
      } catch (err) {
        console.warn("SignalR connection failed:", err);
      }
    }

    startConnection();

    return () => {
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke("LeavePipeline", pipelineId).catch(() => {});
      }
      connection.stop().catch(() => {});
    };
  }, [pipelineId, queryClient]);

  return { connection: connectionRef.current };
}
