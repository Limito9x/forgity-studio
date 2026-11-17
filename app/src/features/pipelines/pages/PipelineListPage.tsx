import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Workflow,
  Plus,
  Trash2,
  Cloud,
  Box,
  Laptop,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  usePipelines,
  useRestorePipelineMutation,
  type PipelineSummaryDto,
} from "../hooks/usePipelines";
import { useDialogStore } from "@/stores/dialogStore";
import { ActivePipelinesTab } from "../components/pipeline-list/ActivePipelinesTab";
import { TrashPipelinesTab } from "../components/pipeline-list/TrashPipelinesTab";
import { NodeLibrary } from "../components/NodeLibrary";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

// Ensure pipeline dialogs are registered into the global registry
import "../dialogs";

interface PipelineListPageProps {
  projectId: string;
}

export function PipelineListPage({ projectId }: PipelineListPageProps) {
  const { studioSlug } = useCurrentStudio();
  const [mainTab, setMainTab] = useState<"pipelines" | "catalog">("pipelines");
  const [activeTab, setActiveTab] = useState<"active" | "trash">("active");

  const { data: activePipelines = [], isLoading: isActiveLoading } =
    usePipelines(projectId, false);
  const { data: trashPipelines = [], isLoading: isTrashLoading } =
    usePipelines(projectId, true);

  const restoreMutation = useRestorePipelineMutation(projectId);
  const openDialog = useDialogStore((state) => state.openDialog);

  const handleRestore = async (p: PipelineSummaryDto) => {
    try {
      await restoreMutation.mutateAsync(p.id);
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Cloud className="h-6 w-6 text-sky-500" />
            Studio Central
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Published automation pipelines and shared node catalogue for your studio team.
          </p>
        </div>

        {mainTab === "pipelines" ? (
          <div className="flex items-center gap-2">
            <Link
              to="/studio/$studioSlug/projects/$projectId/pipeline/workspace"
              params={{ studioSlug, projectId }}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5 text-xs bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              )}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>Open Local Workspace</span>
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
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/studio/$studioSlug/projects/$projectId/pipeline/workspace"
              params={{ studioSlug, projectId }}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5 text-xs bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              )}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>Open Local Workspace</span>
            </Link>
          </div>
        )}
      </div>

      {/* Main Studio Navigation Segmented Capsule Tabs */}
      <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/60 gap-1 w-fit">
        <Button
          variant={mainTab === "pipelines" ? "secondary" : "ghost"}
          size="sm"
          onPress={() => setMainTab("pipelines")}
          className={cn(
            "group h-8 flex items-center gap-2 px-3 text-xs font-medium rounded-lg transition-all cursor-pointer",
            mainTab === "pipelines"
              ? "bg-background text-foreground font-semibold shadow-xs border border-border/50 hover:bg-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
        >
          <Workflow
            className={cn(
              "h-3.5 w-3.5",
              mainTab === "pipelines" ? "text-primary" : "text-muted-foreground"
            )}
          />
          <span>Studio Pipelines</span>
          <Badge
            variant="secondary"
            className="text-[10px] h-4.5 px-1.5 font-normal ml-0.5"
          >
            {activePipelines.length}
          </Badge>
        </Button>

        <Button
          variant={mainTab === "catalog" ? "secondary" : "ghost"}
          size="sm"
          onPress={() => setMainTab("catalog")}
          className={cn(
            "group h-8 flex items-center gap-2 px-3 text-xs font-medium rounded-lg transition-all cursor-pointer",
            mainTab === "catalog"
              ? "bg-background text-foreground font-semibold shadow-xs border border-border/50 hover:bg-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
        >
          <Box
            className={cn(
              "h-3.5 w-3.5",
              mainTab === "catalog" ? "text-primary" : "text-muted-foreground"
            )}
          />
          <span>Node Catalog</span>
        </Button>
      </div>

      {/* Main Tab Content */}
      {mainTab === "pipelines" ? (
        <div className="space-y-6">
          {/* Segmented Pill Tabs Navigation (Active / Trash) */}
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
                <span>Active</span>
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
                    ? "bg-background text-destructive font-semibold shadow-xs border border-border/50 hover:bg-background"
                    : "text-muted-foreground hover:text-destructive hover:bg-muted/40"
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
                    variant="destructive"
                    className="text-[10px] h-4.5 px-1.5 font-normal ml-0.5"
                  >
                    {trashPipelines.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {activeTab === "active" ? (
            <ActivePipelinesTab
              projectId={projectId}
              pipelines={activePipelines}
              isLoading={isActiveLoading}
              onExportSingle={(_id, _mode) => {}}
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
      ) : (
        <NodeLibrary projectId={projectId} />
      )}
    </div>
  );
}
