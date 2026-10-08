import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Workflow,
  Plus,
  FileCode,
  Loader2,
  Download,
  UploadCloud,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  usePipelines,
  useRestorePipelineMutation,
  type PipelineSummaryDto,
} from "../hooks/usePipelines";
import { usePipelineExport } from "../hooks/usePipelineExportImport";
import { useDialogStore } from "@/stores/dialogStore";
import { ActivePipelinesTab } from "../components/pipeline-list/ActivePipelinesTab";
import { TrashPipelinesTab } from "../components/pipeline-list/TrashPipelinesTab";

// Ensure pipeline dialogs are registered into the global registry
import "../dialogs";

interface PipelineListPageProps {
  projectId: string;
}

export function PipelineListPage({ projectId }: PipelineListPageProps) {
  const [activeTab, setActiveTab] = useState<"active" | "trash">("active");

  const { data: activePipelines = [], isLoading: isActiveLoading } =
    usePipelines(projectId, false);
  const { data: trashPipelines = [], isLoading: isTrashLoading } =
    usePipelines(projectId, true);

  const restoreMutation = useRestorePipelineMutation(projectId);
  const { exportSingle, exportBatch, isExportingBatch } = usePipelineExport();
  const openDialog = useDialogStore((state) => state.openDialog);

  const handleRestore = async (p: PipelineSummaryDto) => {
    try {
      await restoreMutation.mutateAsync(p.id);
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <div className="p-6 mx-auto space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            Pipelines
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "active" && activePipelines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                exportBatch({
                  pipelineIds: activePipelines.map((p) => p.id),
                  customFileName: `all-pipelines-${activePipelines.length}-pkg.pipeline.json`,
                })
              }
              isDisabled={isExportingBatch}
              className="gap-1.5 text-xs"
            >
              {isExportingBatch ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="hidden sm:inline">Export All</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onPress={() => openDialog("import-pipeline", { projectId })}
            className="gap-1.5 text-xs"
          >
            <UploadCloud className="h-3.5 w-3.5 text-primary" />
            <span>Import Package</span>
          </Button>

          <Link
            to="/projects/$projectId/pipeline/nodes/new"
            params={{ projectId }}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5 text-xs"
            )}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span className="hidden md:inline">New Custom Node</span>
          </Link>

          <Button
            size="sm"
            onPress={() => openDialog("create-pipeline", { projectId })}
            className="gap-1.5 text-xs shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Pipeline</span>
          </Button>
        </div>
      </div>

      {/* Segmented Pill Tabs Navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/60 gap-1 w-fit">
          <Button
            variant={activeTab === "active" ? "secondary" : "ghost"}
            size="sm"
            onPress={() => setActiveTab("active")}
            className={cn(
              "group h-8 flex items-center gap-2 px-3 text-xs font-medium rounded-lg transition-all cursor-pointer",
              activeTab === "active"
                ? "bg-background text-foreground font-semibold shadow-xs border border-border/50 hover:bg-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Workflow
              className={cn(
                "h-3.5 w-3.5",
                activeTab === "active" ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span>Active Pipelines</span>
            <Badge
              variant="secondary"
              className="text-[10px] h-4.5 px-1.5 font-normal ml-0.5"
            >
              {activePipelines.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === "trash" ? "secondary" : "ghost"}
            size="sm"
            onPress={() => setActiveTab("trash")}
            className={cn(
              "group h-8 flex items-center gap-2 px-3 text-xs font-medium rounded-lg transition-all cursor-pointer",
              activeTab === "trash"
                ? "bg-background text-foreground font-semibold shadow-xs border border-border/50 hover:bg-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Trash2
              className={cn(
                "h-3.5 w-3.5",
                activeTab === "trash" ? "text-destructive" : "text-muted-foreground"
              )}
            />
            <span>Trash</span>
            {trashPipelines.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] h-4.5 px-1.5 font-medium ml-0.5 bg-destructive/10 text-destructive border-destructive/20"
              >
                {trashPipelines.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === "active" ? (
        <ActivePipelinesTab
          projectId={projectId}
          pipelines={activePipelines}
          isLoading={isActiveLoading}
          onExportSingle={(id) => exportSingle({ id })}
        />
      ) : (
        <TrashPipelinesTab
          projectId={projectId}
          pipelines={trashPipelines}
          isLoading={isTrashLoading}
          onRestore={handleRestore}
          isRestoring={restoreMutation.isPending}
        />
      )}
    </div>
  );
}
