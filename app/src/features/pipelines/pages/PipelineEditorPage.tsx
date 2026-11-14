import { useMemo, useCallback } from "react";
import { useNodePalette, useCancelPipelineExecution } from "../hooks/usePipelines";
import {
  resolveToolPins as resolveToolPinsApi,
  useGetStructCatalogue,
  validatePipeline,
} from "@/gen/endpoints/pipelines/pipelines";
import { useRunners } from "@/features/runners/hooks/useRunners";
import type { PipelineDiagnostic } from "../hooks/usePipelineGraph";
import type {
  PipelineValidationSummary,
  ResolveToolPinsParams,
} from "../context/PipelineWorkspaceContext";
import { ReactFlowProvider } from "@xyflow/react";
import { usePipelineGraph } from "../hooks/usePipelineGraph";
import { PipelineCanvas } from "../components/canvas/PipelineCanvas";
import { PipelineWorkspaceProvider } from "../context/PipelineWorkspaceContext";
import { CloudPipelineStorageAdapter } from "../adapters/CloudPipelineStorageAdapter";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

interface PipelineEditorPageProps {
  projectId: string;
  pipelineId: string;
}

export function PipelineEditorPage({ projectId, pipelineId }: PipelineEditorPageProps) {
  const { data: graph, isLoading, error } = usePipelineGraph(pipelineId);
  const { data: paletteItems = [], isLoading: isLoadingPalette } = useNodePalette(projectId);
  const { data: structCatalogue = [] } = useGetStructCatalogue(
    { projectId },
    { query: { enabled: Boolean(projectId) } }
  );
  const { data: runners = [], isLoading: isLoadingRunners } = useRunners();
  const cancelMutation = useCancelPipelineExecution(pipelineId);
  const { studioSlug } = useCurrentStudio();

  const cloudStorage = useMemo(
    () => new CloudPipelineStorageAdapter({ projectId }),
    [projectId]
  );

  const handleResolveToolPins = useCallback(
    async (params: ResolveToolPinsParams, signal?: AbortSignal) => {
      const res = await resolveToolPinsApi(
        {
          toolId: params.toolId,
          configValues: params.configValues,
          projectId: params.projectId,
        },
        signal
      );
      return res
        ? {
            inputs: (res.inputs ?? []) as any[],
            outputs: (res.outputs ?? []) as any[],
          }
        : null;
    },
    []
  );

  const handleValidateGraph = useCallback(
    async (snapshot: Record<string, unknown>): Promise<PipelineValidationSummary> => {
      const res = await validatePipeline(pipelineId, snapshot as any);
      return {
        isValid: res?.isValid,
        diagnostics: (res?.diagnostics ?? []) as PipelineDiagnostic[],
        cycleNodeIds: res?.cycleNodeIds ?? undefined,
        unresolvedPins: res?.unresolvedPins?.map((p) => ({
          pinLabel: p.pinLabel ?? undefined,
          pinKey: p.pinKey ?? undefined,
        })),
      };
    },
    [pipelineId]
  );

  const handleCancelExecution = async (executionId: string) => {
    try {
      await cancelMutation.mutateAsync({ id: executionId });
      toast.success("Pipeline cancellation requested.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel execution.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center bg-background text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading Pipeline Canvas...</span>
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center bg-background p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-3">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Failed to load pipeline</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          {(error as any)?.message || "The requested pipeline could not be found or failed to load."}
        </p>
        <Link
          to="/s/$studioSlug/projects/$projectId/pipeline"
          params={{ studioSlug, projectId }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 gap-1.5 text-xs")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Pipelines</span>
        </Link>
      </div>
    );
  }

  return (
    <PipelineWorkspaceProvider
      mode="cloud"
      projectId={projectId}
      storage={cloudStorage}
      paletteItems={paletteItems}
      structCatalogue={structCatalogue}
      isLoadingPalette={isLoadingPalette}
      runners={runners}
      isLoadingRunners={isLoadingRunners}
      resolveToolPins={handleResolveToolPins}
      validateGraph={handleValidateGraph}
      cancelExecution={handleCancelExecution}
    >
      <div className="h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background">
        <ReactFlowProvider>
          <PipelineCanvas projectId={projectId} graph={graph} storage={cloudStorage} />
        </ReactFlowProvider>
      </div>
    </PipelineWorkspaceProvider>
  );
}
