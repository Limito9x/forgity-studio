export const ExecutionStatus = {
  Pending: "Pending",
  Running: "Running",
  WaitingForRunner: "WaitingForRunner",
  WaitingForSubPipeline: "WaitingForSubPipeline",
  Succeeded: "Succeeded",
  Failed: "Failed",
  Cancelled: "Cancelled",
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export function mapExecutionStatus(status: number | string): ExecutionStatus {
  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (s === "pending") return ExecutionStatus.Pending;
    if (s === "running") return ExecutionStatus.Running;
    if (s === "waitingforrunner" || s === "waitingforagent" || s === "waitingforsubpipeline")
      return ExecutionStatus.WaitingForRunner;
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
    case 7:
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
  _pipelineId?: string,
  _callbacks?: {
    onExecutionStarted?: (executionId: string) => void;
    onNodeExecutionUpdated?: (
      executionId: string,
      nodeId: string,
      status?: string,
      outputs?: Record<string, any>,
      errorMessage?: string | null,
    ) => void;
    onExecutionFinished?: (
      executionId: string,
      status?: ExecutionStatus,
      errorMessage?: string,
    ) => void;
  },
) {
  // SignalR /hubs/pipeline-executions removed per ADR-008 / BL-055.
  // Live execution events are streamed locally via Tauri IPC (local-pipeline://event).
  return {
    joinExecution: async (_executionId: string) => {},
    leaveExecution: async (_executionId: string) => {},
  };
}
