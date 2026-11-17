import type {
  PipelineGraphDto,
  PipelineNodeGraphDto,
  PipelineFileAssetDto,
  PipelineEdgeGraphDto,
  PipelineParameterDto,
  PipelineParameterKind,
  SavePipelineNodeItem,
  SavePipelineEdgeItem,
  PipelineDiagnostic,
  PipelineDiagnosticSeverity,
  PipelineDiagnosticCode,
  PipelineSummaryDto,
  CreatePipelineCommand,
  EdgeKind,
  PipelineSnapshotSummaryDto,
  CreatePipelineSnapshotRequest,
  ListOfPipelineSnapshotSummaryDto,
} from "../types/pipelineGraphTypes";
import { PipelineNodeKind } from "../types/pipelineGraphTypes";
import { ExecutionStatus } from "./usePipelineSignalR";

export type StageKindType = "Worker" | "Server" | "Macro";

export interface SavePipelineGraphRequest {
  nodes?: SavePipelineNodeItem[];
  edges?: SavePipelineEdgeItem[];
  parameters?: PipelineParameterDto[] | null;
  [key: string]: any;
}

export type SavePipelineGraphData = Omit<SavePipelineGraphRequest, "parameters"> & {
  parameters?: PipelineParameterDto[] | any[] | null;
};

export interface RunPipelineRequest {
  runtimeInputs?: Record<string, any>;
  [key: string]: any;
}

export interface ValidatePipelineQuery {
  [key: string]: any;
}

export interface ValidatePipelineResponse {
  isValid: boolean;
  diagnostics?: PipelineDiagnostic[];
}

export interface UpdatePipelineTriggerRequest {
  triggerType?: any;
  triggerConfig?: any;
}

export interface PipelineExecutionDto {
  id: string;
  pipelineId?: string;
  status: string | number;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  [key: string]: any;
}

export interface NodeExecutionDto {
  id: string;
  nodeId: string;
  status: string | number;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  outputs?: Record<string, any> | null;
  [key: string]: any;
}

export { PipelineNodeKind, ExecutionStatus };
export type {
  PipelineParameterDto,
  PipelineParameterKind,
  SavePipelineNodeItem,
  SavePipelineEdgeItem,
  PipelineGraphDto,
  PipelineFileAssetDto,
  PipelineNodeGraphDto,
  PipelineEdgeGraphDto,
  PipelineDiagnostic,
  PipelineDiagnosticSeverity,
  PipelineDiagnosticCode,
  PipelineSummaryDto,
  CreatePipelineCommand,
  EdgeKind,
  PipelineSnapshotSummaryDto,
  CreatePipelineSnapshotRequest,
  ListOfPipelineSnapshotSummaryDto,
};

export type ExtendedPipelineGraphDto = PipelineGraphDto;

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export const usePipelines = (_projectId?: string, _isArchived: boolean = false) => {
  return {
    data: [] as PipelineSummaryDto[],
    isLoading: false,
    refetch: async () => ({ data: [] as PipelineSummaryDto[] }),
  } as const;
};

export const usePipelineGraph = (_pipelineId?: string) => {
  return {
    data: undefined as PipelineGraphDto | undefined,
    isLoading: false,
    refetch: async () => ({ data: undefined as PipelineGraphDto | undefined }),
  } as const;
};

export const usePipelineExecutions = (_pipelineId?: string) => {
  return {
    data: [] as PipelineExecutionDto[],
    isLoading: false,
    refetch: async () => ({ data: [] as PipelineExecutionDto[] }),
  } as const;
};

export const usePipelineExecution = (_executionId?: string) => {
  return {
    data: undefined as PipelineExecutionDto | undefined,
    isLoading: false,
    refetch: async () => ({ data: undefined as PipelineExecutionDto | undefined }),
  } as const;
};

export const useNodeExecutions = (_executionId?: string) => {
  return {
    data: [] as NodeExecutionDto[],
    isLoading: false,
    refetch: async () => ({ data: [] as NodeExecutionDto[] }),
  } as const;
};

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export const useCreatePipeline = (_projectId?: string) => {
  return {
    isPending: false,
    mutate: (_data: any, _options?: any) => {},
    mutateAsync: async (_data: any, _options?: any) => ({} as any),
  };
};

export const useSavePipelineGraph = (_pipelineId?: string) => {
  return {
    isPending: false,
    mutate: (_data: SavePipelineGraphData, _options?: any) => {},
    mutateAsync: async (_data: SavePipelineGraphData, _options?: any) => ({} as any),
  };
};

export const useRunPipeline = (_pipelineId?: string) => {
  return {
    isPending: false,
    mutate: (_data: RunPipelineRequest, _options?: any) => {},
    mutateAsync: async (_data: RunPipelineRequest, _options?: any): Promise<any> => {
      throw new Error("Legacy .NET pipeline run is removed; use Local Runner or Cloud Template Dispatch.");
    },
  };
};

export const useValidatePipeline = (_pipelineId?: string) => {
  return {
    isPending: false,
    mutate: (_data: ValidatePipelineQuery, _options?: any) => {},
    mutateAsync: async (_data: ValidatePipelineQuery, _options?: any): Promise<ValidatePipelineResponse> => ({
      isValid: true,
      diagnostics: [],
    }),
  };
};

export const useUpdatePipelineTrigger = (_pipelineId?: string) => {
  return {
    isPending: false,
    mutate: (_data: UpdatePipelineTriggerRequest, _options?: any) => {},
    mutateAsync: async (_data: UpdatePipelineTriggerRequest, _options?: any) => ({} as any),
  };
};

export const useCancelPipelineExecution = (_pipelineId?: string) => {
  return {
    isPending: false,
    mutate: (_executionId?: any, _options?: any) => {},
    mutateAsync: async (_executionId?: any, _options?: any) => ({} as any),
  };
};

// -----------------------------------------------------------------------------
// Pipeline Snapshots
// -----------------------------------------------------------------------------

export const usePipelineSnapshots = (_pipelineId?: string) => {
  return {
    data: [] as PipelineSnapshotSummaryDto[],
    isLoading: false,
    refetch: async () => ({ data: [] as PipelineSnapshotSummaryDto[] }),
  } as const;
};

export const useCreatePipelineSnapshot = (_pipelineId?: string) => {
  return {
    isPending: false,
    mutate: (_data: CreatePipelineSnapshotRequest, _options?: any) => {},
    mutateAsync: async (_data: CreatePipelineSnapshotRequest, _options?: any) => ({} as any),
  };
};

export const useRollbackPipelineSnapshot = (_pipelineId?: string) => {
  return {
    isPending: false,
    mutate: (_snapshotId: string, _options?: any) => {},
    mutateAsync: async (_snapshotId: string, _options?: any) => ({} as any),
  };
};
