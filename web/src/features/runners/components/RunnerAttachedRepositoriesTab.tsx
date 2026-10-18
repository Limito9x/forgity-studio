import { useState } from "react";
import { useAttachedRepositoriesByRunner, type AttachedRepositoryDto } from "../hooks/useAttachedRepositoriesByRunner";
import { useDialogStore } from "@/stores/dialogStore";
import { useProjectNav } from "@/lib/navigation/useProjectNav";
import { formatRelativeTime } from "../utils/hardwareFormatter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderGit2,
  Lock,
  ExternalLink,
  Unlink,
  RefreshCw,
  Copy,
  Check,
  FolderOpen,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RunnerAttachedRepositoriesTabProps {
  runnerId: string;
  runnerName?: string;
  isOnline?: boolean;
}

export function RunnerAttachedRepositoriesTab({
  runnerId,
  runnerName = "Runner",
}: RunnerAttachedRepositoriesTabProps) {
  const {
    data: attachedRepos = [],
    isLoading,
    refetch,
    isFetching,
  } = useAttachedRepositoriesByRunner(runnerId);

  const openDialog = useDialogStore((state) => state.openDialog);
  const nav = useProjectNav();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyMountPath = async (repoId: string, path?: string) => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopiedId(repoId);
      toast.success("Mount path copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy mount path");
    }
  };

  const handleDetach = (repo: AttachedRepositoryDto) => {
    openDialog("detach-runner-from-repository", {
      repositoryId: repo.repositoryId,
      repositoryName: repo.repositoryName,
      runnerId,
      runnerName,
      rootPath: repo.mountPath,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderGit2 className="size-4.5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Attached Repositories & Workspaces
            </h2>
            <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
              {attachedRepos.length} Repositories
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage local directory mount paths, project associations, and smart asset lock states for this workstation.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onPress={() => refetch()}
          isDisabled={isFetching}
          className="gap-2 cursor-pointer text-xs h-8 px-3 shrink-0"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Repositories Table / List */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground text-xs flex items-center justify-center gap-2">
          <RefreshCw className="size-4 animate-spin text-primary" />
          <span>Loading attached repository mappings...</span>
        </div>
      ) : attachedRepos.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-2xl bg-card space-y-4">
          <div className="size-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <FolderGit2 className="size-6" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-sm font-semibold text-foreground">No Attached Repositories</h3>
            <p className="text-xs text-muted-foreground">
              This runner is not connected to any project repositories yet. To attach this workstation, navigate to any Repository and click <span className="font-semibold text-foreground">Attach Runner</span>.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onPress={() => nav.toAllProjects()}
            className="cursor-pointer gap-2 text-xs"
          >
            <span>Explore Projects</span>
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      ) : (
        /* Repositories Grid / Table */
        <div className="border border-border/80 rounded-2xl overflow-hidden bg-card divide-y divide-border/60">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">Project & Repository</div>
            <div className="col-span-4">Local Workstation Mount Path</div>
            <div className="col-span-2">Active Locks</div>
            <div className="col-span-1">Attached</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {attachedRepos.map((repo) => {
            const hasLocks = repo.activeLocksCount > 0;

            return (
              <div
                key={repo.repositoryId}
                className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 px-5 py-4 items-start md:items-center hover:bg-muted/15 transition-colors"
              >
                {/* Project & Repository */}
                <div className="col-span-3 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold px-2 py-0 bg-primary/5 text-primary border-primary/20"
                    >
                      {repo.projectId ? `Project: ${repo.projectId.slice(0, 8)}` : "Project"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="size-4 text-primary shrink-0" />
                    <button
                      onClick={() => nav.toRepositoryDetail(repo.repositoryId, repo.projectId)}
                      className="font-semibold text-xs text-foreground hover:text-primary transition-colors truncate text-left cursor-pointer"
                    >
                      {repo.repositoryName}
                    </button>
                  </div>
                </div>

                {/* Local Mount Path */}
                <div className="col-span-4 min-w-0 w-full space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium md:hidden block">
                    Local Mount Path:
                  </span>
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-muted/40 border border-border/50 max-w-md">
                    <FolderOpen className="size-3.5 text-muted-foreground shrink-0 ml-1" />
                    <span
                      className="font-mono text-[11px] text-foreground truncate flex-1 select-all"
                      title={repo.mountPath || "No path configured"}
                    >
                      {repo.mountPath || "Pending path configuration"}
                    </span>
                    {repo.mountPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onPress={() => handleCopyMountPath(repo.repositoryId, repo.mountPath)}
                        className="size-6 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                        aria-label="Copy mount path"
                      >
                        {copiedId === repo.repositoryId ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Active Locks */}
                <div className="col-span-2">
                  {hasLocks ? (
                    <Badge
                      variant="outline"
                      className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-xs font-mono h-6 px-2 gap-1.5"
                    >
                      <Lock className="size-3 shrink-0" />
                      <span>{repo.activeLocksCount} Locked</span>
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">0 locks</span>
                  )}
                </div>

                {/* Attached At */}
                <div className="col-span-1 text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(repo.attachedAt)}
                </div>

                {/* Actions */}
                <div className="col-span-2 flex items-center justify-end gap-1.5 w-full md:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => nav.toRepositoryDetail(repo.repositoryId, repo.projectId)}
                    className="h-7 px-2.5 text-xs gap-1 cursor-pointer"
                  >
                    <span>Open</span>
                    <ExternalLink className="size-3" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => handleDetach(repo)}
                    className="h-7 px-2.5 text-xs gap-1 cursor-pointer text-destructive hover:text-destructive hover:bg-destructive/10"
                    aria-label="Detach runner from this repository"
                  >
                    <Unlink className="size-3" />
                    <span>Detach</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
