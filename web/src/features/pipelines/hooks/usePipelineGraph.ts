import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as PipelinesApi from "@/gen/endpoints/pipelines/pipelines";
import type {
  PipelineGraphDto,
  PipelineNodeGraphDto,
  PipelineEdgeGraphDto,
  PipelineParameterDto,
  PipelineParameterKind,
  SavePipelineGraphRequest,
  SavePipelineNodeItem,
  SavePipelineEdgeItem,
  AddPipelineNodeRequest,
  UpdatePipelineNodeRequest,
  AddPipelineEdgeRequest,
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
  PipelineNodeGraphDto,
  PipelineEdgeGraphDto,
  AddPipelineNodeRequest,
  UpdatePipelineNodeRequest,
  AddPipelineEdgeRequest,
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

export const usePipelines = (projectId?: string) => {
  return PipelinesApi.useGetPipelines(
    projectId ? { projectId } : undefined,
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
  const queryKey = projectId ? PipelinesApi.getGetPipelinesQueryKey({ projectId }) : ["pipelines"];
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

export const useAddPipelineNode = (pipelineId?: string) => {
  const queryKey = pipelineId ? PipelinesApi.getGetPipelineGraphQueryKey(pipelineId) : ["pipelines"];
  const mutation = createMutationHook(PipelinesApi.useAddPipelineNode, [queryKey])();
  return {
    ...mutation,
    mutate: (data: AddPipelineNodeRequest, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, data }, options),
    mutateAsync: (data: AddPipelineNodeRequest, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, data }, options),
  };
};

export const useUpdatePipelineNode = (pipelineId?: string) => {
  const queryKey = pipelineId ? PipelinesApi.getGetPipelineGraphQueryKey(pipelineId) : ["pipelines"];
  const mutation = createMutationHook(PipelinesApi.useUpdatePipelineNode, [queryKey])();
  return {
    ...mutation,
    mutate: ({ nodeId, data }: { nodeId: string; data: UpdatePipelineNodeRequest }, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, nodeId, data }, options),
    mutateAsync: ({ nodeId, data }: { nodeId: string; data: UpdatePipelineNodeRequest }, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, nodeId, data }, options),
  };
};

/**
 * Mutation chuyên dùng cho Drag/Drop tọa độ: Lưu ngầm vào DB mà KHÔNG invalidate query,
 * tránh refetch và reset toàn bộ nodes trên Canvas gây giật lag.
 */
export const useUpdateNodePosition = (pipelineId?: string) => {
  const mutation = PipelinesApi.useUpdatePipelineNode();
  return {
    ...mutation,
    mutate: ({ nodeId, data }: { nodeId: string; data: UpdatePipelineNodeRequest }, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, nodeId, data }, options),
    mutateAsync: ({ nodeId, data }: { nodeId: string; data: UpdatePipelineNodeRequest }, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, nodeId, data }, options),
  };
};

export const useDeletePipelineNode = (pipelineId?: string) => {
  const queryKey = pipelineId ? PipelinesApi.getGetPipelineGraphQueryKey(pipelineId) : ["pipelines"];
  const mutation = createMutationHook(PipelinesApi.useDeletePipelineNode, [queryKey])();
  return {
    ...mutation,
    mutate: (nodeId: string, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, nodeId }, options),
    mutateAsync: (nodeId: string, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, nodeId }, options),
  };
};

export const useAddPipelineEdge = (pipelineId?: string) => {
  const queryKey = pipelineId ? PipelinesApi.getGetPipelineGraphQueryKey(pipelineId) : ["pipelines"];
  const mutation = createMutationHook(PipelinesApi.useAddPipelineEdge, [queryKey])();
  return {
    ...mutation,
    mutate: (data: AddPipelineEdgeRequest, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, data }, options),
    mutateAsync: (data: AddPipelineEdgeRequest, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, data }, options),
  };
};

export const useDeletePipelineEdge = (pipelineId?: string) => {
  const queryKey = pipelineId ? PipelinesApi.getGetPipelineGraphQueryKey(pipelineId) : ["pipelines"];
  const mutation = createMutationHook(PipelinesApi.useDeletePipelineEdge, [queryKey])();
  return {
    ...mutation,
    mutate: (edgeId: string, options?: any) =>
      mutation.mutate({ pipelineId: pipelineId!, edgeId }, options),
    mutateAsync: (edgeId: string, options?: any) =>
      mutation.mutateAsync({ pipelineId: pipelineId!, edgeId }, options),
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


