import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  exportPipeline,
  exportPipelineBatch,
  validatePipelinePackage,
  importPipelinePackage,
  getGetPipelinesQueryKey,
} from "@/gen/endpoints/pipelines/pipelines";
import { getGetNodePaletteQueryKey } from "@/gen/endpoints/pipeline-nodes/pipeline-nodes";
import type {
  PipelinePackageDto,
  ValidatePipelinePackageRequest,
  ValidatePipelinePackageResponseDto,
  ImportPipelinePackageRequest,
  ImportPipelinePackageResponseDto,
  PipelinePackageItemPreviewDto,
  PipelineScriptDependencyPreviewDto,
} from "@/gen/model";

export type {
  PipelinePackageDto,
  ValidatePipelinePackageRequest,
  ValidatePipelinePackageResponseDto,
  ImportPipelinePackageRequest,
  ImportPipelinePackageResponseDto,
  PipelinePackageItemPreviewDto,
  PipelineScriptDependencyPreviewDto,
};

export function downloadPackageFile(data: PipelinePackageDto, customFileName?: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  let fileName = customFileName;
  if (!fileName) {
    const rootCount = data.metadata?.rootPipelinesCount ?? 1;
    if (rootCount > 1) {
      fileName = `batch-pipelines-${data.pipelines.length}-pkg.pipeline.json`;
    } else {
      const rootPipeline = data.pipelines.find((p) => p.isRoot) ?? data.pipelines[0];
      const safeName = (rootPipeline?.name || "pipeline")
        .toLowerCase()
        .replace(/[^a-z0-9\-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      fileName = `${safeName}.pipeline.json`;
    }
  }

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function usePipelineExport() {
  const exportSingleMutation = useMutation({
    mutationFn: async ({ id, fileName }: { id: string; fileName?: string }) => {
      const packageData = await exportPipeline(id);
      downloadPackageFile(packageData, fileName);
      return packageData;
    },
    onSuccess: (data) => {
      const root = data.pipelines.find((p) => p.isRoot) ?? data.pipelines[0];
      const subCount = data.pipelines.length - 1;
      if (subCount > 0) {
        toast.success(`Exported "${root?.name}" along with ${subCount} sub-pipeline(s)!`);
      } else {
        toast.success(`Exported "${root?.name}" successfully!`);
      }
    },
    onError: () => {
      toast.error("Failed to export pipeline. Please check if the pipeline exists.");
    },
  });

  const exportBatchMutation = useMutation({
    mutationFn: async ({
      pipelineIds,
      customFileName,
    }: {
      pipelineIds: string[];
      customFileName?: string;
    }) => {
      const packageData = await exportPipelineBatch({ pipelineIds });
      downloadPackageFile(packageData, customFileName);
      return packageData;
    },
    onSuccess: (data) => {
      toast.success(
        `Exported package containing ${data.pipelines.length} pipeline(s) successfully!`
      );
    },
    onError: () => {
      toast.error("Failed to export batch pipelines.");
    },
  });

  return {
    exportSingle: exportSingleMutation.mutateAsync,
    isExportingSingle: exportSingleMutation.isPending,
    exportBatch: exportBatchMutation.mutateAsync,
    isExportingBatch: exportBatchMutation.isPending,
  };
}

export function useValidatePackageMutation() {
  return useMutation({
    mutationFn: async (req: ValidatePipelinePackageRequest) => {
      return await validatePipelinePackage(req);
    },
    onError: () => {
      toast.error("Failed to validate pipeline package. The JSON file might be malformed.");
    },
  });
}

export function useImportPackageMutation(projectId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (req: ImportPipelinePackageRequest) => {
      return await importPipelinePackage(req);
    },
    onSuccess: (res) => {
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: getGetPipelinesQueryKey({ projectId, isArchived: false }),
        });
        queryClient.invalidateQueries({
          queryKey: getGetNodePaletteQueryKey({ projectId }),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: ["pipelines"],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["/api/pipeline/nodes"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/pipelines"],
      });
      toast.success(
        `Successfully imported ${res.importedPipelinesCount} pipeline(s) and ${res.installedScriptsCount} custom script(s)!`
      );
    },
    onError: () => {
      toast.error("Failed to import pipeline package. Please review the validation errors.");
    },
  });
}
