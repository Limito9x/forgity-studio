import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Cpu,
  HardDrive,
  Calendar,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { RepositoryDetailDto } from "../hooks/useRepositories";
import type { WorkspaceResourceDto } from "@/gen/model";
import { RepositoryResourceTable } from "./RepositoryResourceTable";

interface RepositoryResourcesTabProps {
  projectId: string;
  repositoryId: string;
  repository: RepositoryDetailDto;
  resources: WorkspaceResourceDto[];
  isLoading: boolean;
  onNavigateToSync: () => void;
  onNavigateToRunners: () => void;
}

export function RepositoryResourcesTab({
  projectId,
  repositoryId,
  repository,
  resources,
  isLoading,
  onNavigateToSync,
  onNavigateToRunners,
}: RepositoryResourcesTabProps) {
  const runners = repository.runners || [];
  const primaryRunner = runners[0];

  return (
    <div className="space-y-4">
      {/* Compact Metric Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <FileText className="size-3 text-primary" /> Total Resources
          </span>
          <p className="text-xl font-bold font-mono text-foreground">{resources.length}</p>
        </div>

        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <Cpu className="size-3 text-emerald-500" /> Active Runners
          </span>
          <p className="text-xl font-bold font-mono text-foreground">{runners.length}</p>
        </div>

        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5 min-w-0">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <HardDrive className="size-3 text-primary" /> Primary Mount
          </span>
          <p className="text-xs font-mono text-foreground truncate mt-1" title={primaryRunner?.rootPath || "None"}>
            {primaryRunner?.rootPath || "No mount path"}
          </p>
        </div>

        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <Calendar className="size-3 text-muted-foreground" /> Created Date
          </span>
          <p className="text-xs font-medium text-foreground mt-1">
            {new Date(repository.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <Card className="rounded-2xl border-border/60 bg-card p-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Loading resources...</span>
          </div>
        </Card>
      ) : resources.length === 0 ? (
        <Card className="rounded-2xl border-border/60 bg-card">
          <CardContent className="p-0">
            <div className="text-center py-20 px-4 space-y-3">
              <FileText className="size-10 text-muted-foreground mx-auto stroke-1" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  No resources discovered yet
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {runners.length > 0
                    ? "Your compute runner is attached. Go to the Changes & Sync tab to scan and synchronize files."
                    : "Attach a local runner to scan and synchronize files into this repository."}
                </p>
              </div>
              <div className="pt-1">
                {runners.length > 0 ? (
                  <Button
                    size="sm"
                    onClick={onNavigateToSync}
                    className="gap-1.5 cursor-pointer text-xs"
                  >
                    <RefreshCw className="size-3.5" /> Go to Changes & Sync
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={onNavigateToRunners}
                    className="gap-1.5 cursor-pointer text-xs"
                  >
                    <Cpu className="size-3.5" /> Attach Runner in Runners Tab
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <RepositoryResourceTable
          data={resources}
          totalCount={resources.length}
          isLoading={isLoading}
          projectId={projectId}
          repositoryId={repositoryId}
        />
      )}
    </div>
  );
}
