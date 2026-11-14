import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
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

import { saveFileWithStrategy } from "@/lib/platform/saveFileStrategy";

export function downloadPackageFile(data: PipelinePackageDto, customFileName?: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });

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

  saveFileWithStrategy({
    fileName,
    blob,
    extensions: ["json", "pipeline.json"],
    filterName: "Pipeline Package JSON",
  });
}

export type ExportPipelineMode = "FullBackup" | "CleanTemplate" | "TextOnly";

function mapExportModeToApi(mode: ExportPipelineMode): number {
  switch (mode) {
    case "CleanTemplate":
      return 1;
    case "TextOnly":
      return 2;
    case "FullBackup":
    default:
      return 0;
  }
}

export function usePipelineExport() {
  const exportSingleMutation = useMutation({
    mutationFn: async ({
      id,
      fileName,
      mode = "FullBackup",
    }: {
      id: string;
      fileName?: string;
      mode?: ExportPipelineMode;
    }) => {
      const packageData = await exportPipelineBatch({
        pipelineIds: [id],
        mode: mapExportModeToApi(mode),
      } as any);
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
      mode = "FullBackup",
    }: {
      pipelineIds: string[];
      customFileName?: string;
      mode?: ExportPipelineMode;
    }) => {
      const packageData = await exportPipelineBatch({
        pipelineIds,
        mode: mapExportModeToApi(mode),
      } as any);
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
