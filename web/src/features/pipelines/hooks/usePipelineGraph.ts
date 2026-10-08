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
  PipelineExecutionDto,
  NodeExecutionDto,
  PipelineSummaryDto,
  CreatePipelineCommand,
  UpdatePipelineTriggerRequest,
  EdgeKind,
  ExecutionStatus,
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
  PipelineExecutionDto,
  NodeExecutionDto,
  PipelineSummaryDto,
  CreatePipelineCommand,
  EdgeKind,
  ExecutionStatus,
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
  const mutation = PipelinesApi.useSavePipelineGraph();
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


