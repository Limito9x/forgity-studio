import { filterPalette } from "../nodeDefinitions";
import { useQuery, useMutation } from "@tanstack/react-query";
import type {
  CreatePipelineCommand,
  NodePaletteItemDto,
  PipelineSummaryDto,
} from "../types/pipelineGraphTypes";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  useIngestCloudPipelineData,
  useDispatchCloudBundle,
  usePublishCloudPipeline,
} from "@/gen/endpoints/pipelines/pipelines";

export type {
  CreatePipelineCommand,
  NodePaletteItemDto,
  PipelineSummaryDto,
};

export function usePipelines(_projectId?: string, _isArchived: boolean = false) {
  return useQuery({
    queryKey: ["pipelines", _projectId, _isArchived],
    queryFn: async (): Promise<PipelineSummaryDto[]> => [],
    enabled: false,
  });
}

export function useCreatePipelineMutation(_projectId?: string) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (_data: CreatePipelineCommand): Promise<PipelineSummaryDto> => {
      throw new Error("Direct project pipeline creation is deprecated. Use local workspace or cloud templates.");
    },
    onError: (err: any) => {
      toast.error(t("pipelines.createFailed", { defaultValue: err?.message }));
    },
  });
}

export function useUpdatePipelineMutation(_projectId?: string, _pipelineId?: string) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }): Promise<any> => {
      return { id, ...data };
    },
    onSuccess: () => {
      toast.success(
        t("pipelines.updateSuccess", { defaultValue: "Pipeline updated successfully" })
      );
    },
  });
}

export function useDeletePipelineMutation(_projectId?: string) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (_id: string): Promise<void> => {},
    onSuccess: () => {
      toast.success(
        t("pipelines.archiveSuccess", { defaultValue: "Pipeline moved to Trash successfully" })
      );
    },
  });
}

export function useRestorePipelineMutation(_projectId?: string) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (_id: string): Promise<any> => ({}),
    onSuccess: () => {
      toast.success(
        t("pipelines.restoreSuccess", {
          defaultValue: "Pipeline restored successfully",
        })
      );
    },
  });
}

export function usePurgePipelineMutation(_projectId?: string) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (_id: string): Promise<void> => {},
    onSuccess: () => {
      toast.success(
        t("pipelines.purgeSuccess", { defaultValue: "Pipeline permanently deleted" })
      );
    },
  });
}

export function useNodePalette(_projectId?: string, executor?: string) {
  return useQuery({
    queryKey: ["nodes", "palette", _projectId],
    queryFn: async (): Promise<NodePaletteItemDto[]> => [],
    enabled: false,
    staleTime: Infinity,
    select: executor ? (items) => filterPalette(items, executor) : undefined,
  });
}

export function usePipelineNodeMutations(_projectId?: string) {
  return {
    parseScript: async (_data: any) => ({}),
    isParsingScript: false,
    createNode: async (_data: any) => ({}),
    isCreatingNode: false,
    updateNode: async (_args: any) => ({}),
    isUpdatingNode: false,
    deleteNode: async (_id: string) => {},
    isDeletingNode: false,
  };
}

export function useCustomNodeById(_id?: string) {
  return useQuery({
    queryKey: ["nodes", "custom", _id],
    queryFn: async () => null,
    enabled: false,
  });
}

export {
  useIngestCloudPipelineData,
  useDispatchCloudBundle,
  usePublishCloudPipeline,
};

export { useCancelPipelineExecution } from "./usePipelineGraph";
