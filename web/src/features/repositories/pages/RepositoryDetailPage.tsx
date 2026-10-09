import { useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import {
  useRepositoryDetail,
  useRepositoryResources,
  type RepositoryRunnerDto,
} from "../hooks/useRepositories";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  FolderGit2,
  RefreshCw,
  Cpu,
  FileText,
  Loader2,
  MoreVertical,
  Edit2,
} from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";
import { AttachedRunnersCard } from "../components/AttachedRunnersCard";
import { RepositorySyncTab } from "../components/RepositorySyncTab";
import { RepositoryResourcesTab } from "../components/RepositoryResourcesTab";
import { TagTool } from "@/features/tags/components/TagTool";
import { cn } from "@/lib/utils";

import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

type RepositoryTab = "resources" | "sync" | "runners";

interface RepositoryDetailPageProps {
  projectId?: string;
  repositoryId?: string;
}

export function RepositoryDetailPage(props: RepositoryDetailPageProps = {}) {
  const routeParams = useParams({
    strict: false,
  }) as { projectId?: string; repositoryId?: string };

  const { studioSlug } = useCurrentStudio();
  const projectId = props.projectId || routeParams.projectId || "";
  const repositoryId = props.repositoryId || routeParams.repositoryId || "";

  const navigate = useNavigate();
  const openDialog = useDialogStore((state) => state.openDialog);

  const [activeTab, setActiveTab] = useState<RepositoryTab>("resources");

  const {
    data: repository,
    isLoading: isRepoLoading,
    refetch: refetchRepo,
  } = useRepositoryDetail(repositoryId);

  const {
    data: resourcesData,
    isLoading: isResourcesLoading,
    refetch: refetchResources,
  } = useRepositoryResources(repositoryId, projectId);

  const handleRefreshAll = () => {
    refetchRepo();
    refetchResources();
  };

  const runners: RepositoryRunnerDto[] = repository?.runners || [];
  const resources = resourcesData?.items || [];

  if (isRepoLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3 text-muted-foreground text-sm">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span>Loading repository workspace...</span>
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground text-sm">Repository not found.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/s/$studioSlug/projects/$projectId/repositories", params: { studioSlug, projectId } })}
          className="gap-2 cursor-pointer text-xs"
        >
          <ArrowLeft className="size-4" /> Back to Repositories
        </Button>
      </div>
    );
  }

  const primaryRunner = runners[0];
  const isOnline = primaryRunner?.runner?.isActive ?? true;

  const tabs: Array<{ key: RepositoryTab; label: string; icon: React.ElementType; badge?: React.ReactNode }> = [
    {
      key: "resources",
      label: "Resources",
      icon: FileText,
      badge: (
        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4 min-w-4 flex items-center justify-center">
          {resources.length}
        </Badge>
      ),
    },
    {
      key: "sync",
      label: "Changes & Sync",
      icon: RefreshCw,
    },
    {
      key: "runners",
      label: "Attached Runners",
      icon: Cpu,
      badge: (
        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4 min-w-4 flex items-center justify-center">
          {runners.length}
        </Badge>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 w-full min-w-0">
      {/* Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl cursor-pointer shrink-0"
            onClick={() => navigate({ to: "/s/$studioSlug/projects/$projectId/repositories", params: { studioSlug, projectId } })}
            aria-label="Back to repositories"
          >
            <ArrowLeft className="size-4" />
          </Button>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5 truncate">
                <FolderGit2 className="size-6 text-primary shrink-0" />
                <span className="truncate">{repository.name}</span>
              </h1>

              <Badge
                variant="outline"
                className={
                  runners.length > 0 && isOnline
                    ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-xs font-mono"
                    : "text-muted-foreground border-border text-xs font-mono"
                }
              >
                <span
                  className={`size-1.5 rounded-full mr-1.5 ${
                    runners.length > 0 && isOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                {runners.length > 0 ? `${runners.length} Runner Connected` : "No Runner"}
              </Badge>
            </div>

            {repository.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">{repository.description}</p>
            )}

            {(repository as any).supportedExtensions && (repository as any).supportedExtensions.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="text-[11px] text-muted-foreground">Extensions:</span>
                {(repository as any).supportedExtensions.map((ext: string) => (
                  <Badge key={ext} variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                    .{ext}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Header Right Actions: Clean & Minimal */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            className="gap-1.5 cursor-pointer text-xs h-8 px-3"
            aria-label="Refresh repository and resource data"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>

          <DropdownMenuTrigger>
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-lg cursor-pointer"
              aria-label="Repository options"
            >
              <MoreVertical className="size-4" />
            </Button>
            <DropdownMenu placement="bottom end">
              <DropdownMenuItem
                onAction={() =>
                  openDialog("update-repository", {
                    id: repository.id,
                    name: repository.name,
                    description: repository.description || undefined,
                    projectId: repository.projectId,
                    supportedExtensions: (repository as any).supportedExtensions,
                  })
                }
                className="gap-2 text-xs cursor-pointer"
              >
                <Edit2 className="size-3.5" /> Edit Repository
              </DropdownMenuItem>
            </DropdownMenu>
          </DropdownMenuTrigger>
        </div>
      </div>

      {/* Segmented Pill Tabs Navigation */}
      <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/60 gap-1 w-fit">
        {tabs.map(({ key, label, icon: Icon, badge }) => {
          const isActive = activeTab === key;
          return (
            <Button
              key={key}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(key)}
              className={cn(
                "group h-8 flex items-center gap-2 px-3 text-xs font-medium rounded-lg transition-all select-none cursor-pointer",
                isActive
                  ? "bg-background text-foreground font-semibold shadow-xs border border-border/50 hover:bg-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Icon className={cn("size-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
              <span>{label}</span>
              {badge}
            </Button>
          );
        })}
      </div>

      {/* Tab 1: Resources & Assets */}
      {activeTab === "resources" && (
        <RepositoryResourcesTab
          projectId={projectId}
          repositoryId={repository.id}
          repository={repository}
          resources={resources}
          isLoading={isResourcesLoading}
          onNavigateToSync={() => setActiveTab("sync")}
          onNavigateToRunners={() => setActiveTab("runners")}
        />
      )}

      {/* Tab 2: Changes & Sync (In-page Diff & Commit Center) */}
      {activeTab === "sync" && (
        <RepositorySyncTab
          repositoryId={repository.id}
          repositoryName={repository.name}
          runners={runners}
          onAttachRunner={() =>
            openDialog("attach-runner-to-repository", {
              repositoryId: repository.id,
              repositoryName: repository.name,
            })
          }
          onSyncSuccess={handleRefreshAll}
        />
      )}

      {/* Tab 3: Attached Runners */}
      {activeTab === "runners" && (
        <AttachedRunnersCard
          repositoryId={repository.id}
          repositoryName={repository.name}
          runners={runners}
          onAttachRunner={(initial) =>
            openDialog("attach-runner-to-repository", {
              repositoryId: repository.id,
              repositoryName: repository.name,
              runnerId: initial?.runnerId,
              rootPath: initial?.rootPath,
            })
          }
          onScanSyncRunner={() => setActiveTab("sync")}
        />
      )}

      {/* Floating TagTool for easy drag-and-drop */}
      <TagTool projectId={projectId} />
    </div>
  );
}
