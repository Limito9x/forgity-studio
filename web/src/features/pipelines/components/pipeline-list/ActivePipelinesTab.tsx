import { Workflow, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineSummaryDto } from "@/gen/model";
import { PipelineCard } from "./PipelineCard";
import { useDialogStore } from "@/stores/dialogStore";

interface ActivePipelinesTabProps {
  projectId: string;
  pipelines: PipelineSummaryDto[];
  isLoading: boolean;
  onExportSingle: (id: string) => void;
}

export function ActivePipelinesTab({
  projectId,
  pipelines,
  isLoading,
  onExportSingle,
}: ActivePipelinesTabProps) {
  const openDialog = useDialogStore((state) => state.openDialog);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
        Loading pipelines...
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/40">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner mb-4">
          <Workflow className="h-7 w-7" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          No pipelines created yet
        </h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          Create your first visual pipeline to orchestrate multi-step tasks across
          Blender, Unreal Engine, and background automation tasks.
        </p>
        <Button
          onPress={() => openDialog("create-pipeline", { projectId })}
          size="sm"
          className="mt-5 gap-1.5 text-xs shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Pipeline</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {pipelines.map((p) => (
        <PipelineCard
          key={p.id}
          pipeline={p}
          mode="active"
          projectId={projectId}
          onExportSingle={onExportSingle}
        />
      ))}
    </div>
  );
}
