import { Trash2, Loader2, Info } from "lucide-react";
import type { PipelineSummaryDto } from "@/gen/model";
import { PipelineCard } from "./PipelineCard";

interface TrashPipelinesTabProps {
  projectId: string;
  pipelines: PipelineSummaryDto[];
  isLoading: boolean;
  onRestore: (pipeline: PipelineSummaryDto) => void;
  isRestoring?: boolean;
}

export function TrashPipelinesTab({
  projectId,
  pipelines,
  isLoading,
  onRestore,
  isRestoring,
}: TrashPipelinesTabProps) {
  return (
    <div className="space-y-5">
      {/* Informational Safety Banner */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-xs">
        <Info className="h-4 w-4 shrink-0 text-amber-500" />
        <div className="flex-1">
          <span className="font-medium">Safely archived graphs: </span>
          All node layouts, parameters, connections, and execution histories are
          preserved. You can restore a pipeline at any time, or purge it
          permanently if no longer needed.
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
          Loading trash...
        </div>
      ) : pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/40">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
            <Trash2 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Trash is empty
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            When you move a pipeline to trash, it will be safely archived here
            with all nodes, connections, and execution history preserved.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pipelines.map((p) => (
            <PipelineCard
              key={p.id}
              pipeline={p}
              mode="trash"
              projectId={projectId}
              onRestore={onRestore}
              isRestoring={isRestoring}
            />
          ))}
        </div>
      )}
    </div>
  );
}
