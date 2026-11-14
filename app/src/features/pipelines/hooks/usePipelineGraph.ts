import { useQueryClient } from "@tanstack/react-query";
import * as NodeApi from "@/gen/endpoints/pipeline-nodes/pipeline-nodes";
import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as PipelinesApi from "@/gen/endpoints/pipelines/pipelines";
import type {
  PipelineGraphDto,
  PipelineNodeGraphDto,
  PipelineFileAssetDto,
  PipelineEdgeGraphDto,
  PipelineParameterDto,
  PipelineParameterKind,
  SavePipelineGraphRequest,
  SavePipelineNodeItem,
  SavePipelineEdgeItem,
  RunPipelineRequest,
  ValidatePipelineQuery,
  ValidatePipelineResponse,
  PipelineDiagnostic,
  PipelineDiagnosticSeverity,
  PipelineDiagnosticCode,
  PipelineExecutionDto,
  NodeExecutionDto,
  PipelineSummaryDto,
  CreatePipelineCommand,
  UpdatePipelineTriggerRequest,
  EdgeKind,
  ExecutionStatus,
  PipelineSnapshotSummaryDto,
  CreatePipelineSnapshotRequest,
  ListOfPipelineSnapshotSummaryDto,
} from "@/gen/model";
import { PipelineNodeKind } from "@/gen/model";

export type StageKindType = "Worker" | "Server" | "Macro";

// Re-export generated Parameter, Save DTOs, and Enums from Orval
export { PipelineNodeKind };
export type {
  PipelineParameterDto,
  PipelineParameterKind,
  SavePipelineNodeItem,
  SavePipelineEdgeItem,
  SavePipelineGraphRequest,
};

export type SavePipelineGraphData = Omit<SavePipelineGraphRequest, "parameters"> & {
  parameters?: PipelineParameterDto[] | any[] | null;
};

export type ExtendedPipelineGraphDto = PipelineGraphDto;

export type {
  PipelineGraphDto,
  PipelineFileAssetDto,
  PipelineNodeGraphDto,
  PipelineEdgeGraphDto,
  RunPipelineRequest,
  ValidatePipelineQuery,
  ValidatePipelineResponse,
  PipelineDiagnostic,
  PipelineDiagnosticSeverity,
  PipelineDiagnosticCode,
  PipelineExecutionDto,
  NodeExecutionDto,
  PipelineSummaryDto,
  CreatePipelineCommand,
  EdgeKind,
  ExecutionStatus,
  PipelineSnapshotSummaryDto,
  CreatePipelineSnapshotRequest,
  ListOfPipelineSnapshotSummaryDto,
};

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export const usePipelines = (projectId?: string, isArchived: boolean = false) => {
  return PipelinesApi.useGetPipelines(
    projectId ? { projectId, isArchived } : { isArchived },
    {
      query: {
        placeholderData: keepPreviousData,
      },
    }
  );
};

export const usePipelineGraph = (pipelineId?: string) => {
  return PipelinesApi.useGetPipelineGraph(pipelineId || "", {
    query: {
      enabled: !!pipelineId,
      placeholderData: keepPreviousData,
    },
  });
};

export const usePipelineExecutions = (pipelineId?: string) => {
  return PipelinesApi.useGetPipelineExecutions(pipelineId || "", {
    query: {
      enabled: !!pipelineId,
      placeholderData: keepPreviousData,
    },
  });
};

export const usePipelineExecution = (executionId?: string) => {
  return PipelinesApi.useGetPipelineExecution(executionId || "", {
    query: {
      enabled: !!executionId,
    },
  });
};

export const useNodeExecutions = (executionId?: string) => {
  return PipelinesApi.useGetNodeExecutions(executionId || "", {
    query: {
      enabled: !!executionId,
    },
  });
};

// -----------------------------------------------------------------------------
// Mutations (Wrapped with createMutationHook & Orval Generated APIs)
// -----------------------------------------------------------------------------

export const useCreatePipeline = (projectId?: string) => {
  const queryKey = projectId
    ? PipelinesApi.getGetPipelinesQueryKey({ projectId, isArchived: false })
    : ["pipelines"];
  return createMutationHook(PipelinesApi.useCreatePipeline, [queryKey])();
};

export const useSavePipelineGraph = (pipelineId?: string) => {
  const queryClient = useQueryClient();
  const mutation = PipelinesApi.useSavePipelineGraph({ mutation: { onSuccess: (_result, variables) => {
    if (variables.data.parameters) void queryClient.invalidateQueries({ queryKey: NodeApi.getGetNodePaletteQueryKey() });
  } } });
  return {
    ...mutation,
    mutate: (data: SavePipelineGraphData, options?: any) =>
      mutation.mutate({ id: pipelineId!, data: data as any }, options),
    mutateAsync: (data: SavePipelineGraphData, options?: any) =>
      mutation.mutateAsync({ id: pipelineId!, data: data as any }, options),
  };
};

export const useRunPipeline = (pipelineId?: string) => {
  const queryKeys = pipelineId
    ? [
        PipelinesApi.getGetPipelineGraphQueryKey(pipelineId),
        ["pipelines", pipelineId, "executions"],
      ]
    : [["pipelines"]];
  const mutation = createMutationHook(PipelinesApi.useRunPipeline, queryKeys)();
  return {
    ...mutation,
    mutate: (data: RunPipelineRequest, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, data }, options),
    mutateAsync: (data: RunPipelineRequest, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, data }, options),
  };
};

export const useValidatePipeline = (pipelineId?: string) => {
  const mutation = createMutationHook(PipelinesApi.useValidatePipeline, [])();
  return {
    ...mutation,
    mutate: (data: ValidatePipelineQuery, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, data }, options),
    mutateAsync: (data: ValidatePipelineQuery, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, data }, options),
  };
};

export const useUpdatePipelineTrigger = (pipelineId?: string) => {
  const queryKeys = pipelineId
    ? [
        PipelinesApi.getGetPipelineGraphQueryKey(pipelineId),
        ["pipelines"],
      ]
    : [["pipelines"]];
  const mutation = createMutationHook(PipelinesApi.useUpdatePipelineTrigger, queryKeys)();
  return {
    ...mutation,
    mutate: (data: UpdatePipelineTriggerRequest, options?: any) =>
      mutation.mutate({ id: pipelineId!, data }, options),
    mutateAsync: (data: UpdatePipelineTriggerRequest, options?: any) =>
      mutation.mutateAsync({ id: pipelineId!, data }, options),
  };
};

export const useCancelPipelineExecution = (pipelineId?: string) => {
  const queryKeys = [
    ["pipelines", "executions"],
    ...(pipelineId ? [PipelinesApi.getGetPipelineExecutionsQueryKey(pipelineId)] : []),
  ];
  return createMutationHook(PipelinesApi.useCancelPipelineExecution, queryKeys)();
};

// -----------------------------------------------------------------------------
// Pipeline Snapshots (Version History & Checkpoints)
// -----------------------------------------------------------------------------

export const usePipelineSnapshots = (pipelineId?: string) => {
  return PipelinesApi.useGetPipelineSnapshots(pipelineId || "", {
    query: {
      enabled: !!pipelineId,
      placeholderData: keepPreviousData,
    },
  });
};

export const useCreatePipelineSnapshot = (pipelineId?: string) => {
  const queryKeys = pipelineId
    ? [
        PipelinesApi.getGetPipelineSnapshotsQueryKey(pipelineId),
        PipelinesApi.getGetPipelineGraphQueryKey(pipelineId),
      ]
    : [["pipelines"]];
  const mutation = createMutationHook(PipelinesApi.useCreatePipelineSnapshot, queryKeys)();
  return {
    ...mutation,
    mutate: (data: CreatePipelineSnapshotRequest, options?: any) =>
      mutation.mutate({ id: pipelineId!, data }, options),
    mutateAsync: (data: CreatePipelineSnapshotRequest, options?: any) =>
      mutation.mutateAsync({ id: pipelineId!, data }, options),
  };
};

export const useRollbackPipelineSnapshot = (pipelineId?: string) => {
  const queryKeys = pipelineId
    ? [
        PipelinesApi.getGetPipelineSnapshotsQueryKey(pipelineId),
        PipelinesApi.getGetPipelineGraphQueryKey(pipelineId),
      ]
    : [["pipelines"]];
  const mutation = createMutationHook(PipelinesApi.useRollbackPipelineSnapshot, queryKeys)();
  return {
    ...mutation,
    mutate: (snapshotId: string, options?: any) =>
      mutation.mutate({ id: pipelineId!, snapshotId }, options),
    mutateAsync: (snapshotId: string, options?: any) =>
      mutation.mutateAsync({ id: pipelineId!, snapshotId }, options),
  };
};




