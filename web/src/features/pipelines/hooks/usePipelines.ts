import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNodePalette,
  getGetNodePaletteQueryKey,
  parseScriptSchema,
  createCustomNode,
  updateCustomNode,
  deleteCustomNode,
  getCustomNodeById,
  getGetCustomNodeByIdQueryKey,
  analyzeCustomNodesBatch,
  batchUpsertCustomNodes,
} from "@/gen/endpoints/pipeline-nodes/pipeline-nodes";
import type {
  CreateCustomNodeCommand,
  UpdateCustomNodeRequest,
  ParseScriptCommand,
  NodePaletteItemDto,
  ParseScriptResponseDto,
  CreatePipelineCommand,
  UpdatePipelineRequest,
  PipelineSummaryDto,
} from "@/gen/model";

export type {
  CreateCustomNodeCommand,
  UpdateCustomNodeRequest,
  ParseScriptCommand,
  NodePaletteItemDto,
  ParseScriptResponseDto,
  CreatePipelineCommand,
  UpdatePipelineRequest,
  PipelineSummaryDto,
};
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import {
  getPipelines,
  getGetPipelinesQueryKey,
  createPipeline,
  updatePipeline,
  deletePipeline,
  getGetPipelineGraphQueryKey,
} from "@/gen/endpoints/pipelines/pipelines";

export function usePipelines(projectId?: string) {
  return useQuery({
    queryKey: getGetPipelinesQueryKey(projectId ? { projectId } : undefined),
    queryFn: ({ signal }) => getPipelines(projectId ? { projectId } : undefined, signal),
    enabled: !!projectId,
  });
}

export function useCreatePipelineMutation(projectId?: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: CreatePipelineCommand) => createPipeline(data),
    onSuccess: () => {
      toast.success(
        t("pipelines.createSuccess", { defaultValue: "Pipeline created successfully" })
      );
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetPipelinesQueryKey({ projectId }),
        });
      }
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to create pipeline";
      toast.error(t("pipelines.createFailed", { defaultValue: errorMsg }));
    },
  });
}

export function useUpdatePipelineMutation(projectId?: string, pipelineId?: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePipelineRequest }) =>
      updatePipeline(id, data),
    onSuccess: (updated) => {
      toast.success(
        t("pipelines.updateSuccess", { defaultValue: "Pipeline renamed successfully" })
      );
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetPipelinesQueryKey({ projectId }),
        });
      }
      const targetId = pipelineId || updated?.id;
      if (targetId) {
        queryClient.invalidateQueries({
          queryKey: getGetPipelineGraphQueryKey(targetId),
        });
      }
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to rename pipeline";
      toast.error(t("pipelines.updateFailed", { defaultValue: errorMsg }));
    },
  });
}

export function useDeletePipelineMutation(projectId?: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => deletePipeline(id),
    onSuccess: () => {
      toast.success(
        t("pipelines.deleteSuccess", { defaultValue: "Pipeline deleted successfully" })
      );
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetPipelinesQueryKey({ projectId }),
        });
      }
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to delete pipeline";
      toast.error(t("pipelines.deleteFailed", { defaultValue: errorMsg }));
    },
  });
}

export function useNodePalette(projectId?: string, executor?: string) {
  return useQuery({
    queryKey: getGetNodePaletteQueryKey({
      projectId: projectId ?? null,
      executor: executor ?? null,
    }),
    queryFn: ({ signal }) =>
      getNodePalette(
        { projectId: projectId ?? null, executor: executor ?? null },
        signal
      ),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePipelineNodeMutations(projectId?: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const parseScriptMutation = useMutation({
    mutationFn: (data: ParseScriptCommand) => parseScriptSchema(data),
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to parse script schema";
      toast.error(t("pipelines.parseFailed", { defaultValue: errorMsg }));
    },
  });

  const createNodeMutation = useMutation({
    mutationFn: (data: CreateCustomNodeCommand) => createCustomNode(data),
    onSuccess: () => {
      toast.success(
        t("pipelines.createNodeSuccess", { defaultValue: "Custom node created successfully" })
      );
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetNodePaletteQueryKey({ projectId }),
        });
      }
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to create custom node";
      toast.error(t("pipelines.createNodeFailed", { defaultValue: errorMsg }));
    },
  });

  const updateNodeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomNodeRequest }) =>
      updateCustomNode(id, data),
    onSuccess: () => {
      toast.success(
        t("pipelines.updateNodeSuccess", { defaultValue: "Custom node updated successfully" })
      );
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetNodePaletteQueryKey({ projectId }),
        });
      }
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to update custom node";
      toast.error(t("pipelines.updateNodeFailed", { defaultValue: errorMsg }));
    },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: (id: string) => deleteCustomNode(id),
    onSuccess: () => {
      toast.success(
        t("pipelines.deleteNodeSuccess", { defaultValue: "Custom node deleted successfully" })
      );
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetNodePaletteQueryKey({ projectId }),
        });
      }
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to delete node";
      toast.error(t("pipelines.deleteNodeFailed", { defaultValue: errorMsg }));
    },
  });

  return {
    parseScript: parseScriptMutation.mutateAsync,
    isParsingScript: parseScriptMutation.isPending,

    createNode: createNodeMutation.mutateAsync,
    isCreatingNode: createNodeMutation.isPending,

    updateNode: updateNodeMutation.mutateAsync,
    isUpdatingNode: updateNodeMutation.isPending,

    deleteNode: deleteNodeMutation.mutateAsync,
    isDeletingNode: deleteNodeMutation.isPending,
  };
}

export function useCustomNodeById(id?: string) {
  return useQuery({
    queryKey: id ? getGetCustomNodeByIdQueryKey(id) : ["nodes", "custom"],
    queryFn: () => getCustomNodeById(id!),
    enabled: !!id,
  });
}

export function useAnalyzeCustomNodesBatchMutation() {
  return useMutation({
    mutationFn: (data: Parameters<typeof analyzeCustomNodesBatch>[0]) =>
      analyzeCustomNodesBatch(data),
  });
}

export function useBatchUpsertCustomNodesMutation(projectId?: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: Parameters<typeof batchUpsertCustomNodes>[0]) =>
      batchUpsertCustomNodes(data),
    onSuccess: () => {
      toast.success(
        t("pipelines.batchUpsertSuccess", {
          defaultValue: "Custom nodes processed and saved successfully",
        })
      );
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetNodePaletteQueryKey({ projectId }),
        });
      }
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.message || err?.message || "Failed to process custom nodes";
      toast.error(t("pipelines.batchUpsertFailed", { defaultValue: errorMsg }));
    },
  });
}

