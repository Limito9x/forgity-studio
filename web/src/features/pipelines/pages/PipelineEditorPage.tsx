import { ReactFlowProvider } from "@xyflow/react";
import { usePipelineGraph } from "../hooks/usePipelineGraph";
import { PipelineCanvas } from "../components/canvas/PipelineCanvas";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

interface PipelineEditorPageProps {
  projectId: string;
  pipelineId: string;
}

export function PipelineEditorPage({ projectId, pipelineId }: PipelineEditorPageProps) {
  const { data: graph, isLoading, error } = usePipelineGraph(pipelineId);
  const { studioSlug } = useCurrentStudio();

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
    <div className="h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background">
      <ReactFlowProvider>
        <PipelineCanvas projectId={projectId} graph={graph} />
      </ReactFlowProvider>
    </div>
  );
}
