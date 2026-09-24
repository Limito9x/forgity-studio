import { useState, useMemo } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import { useGetRepositoryResources } from "@/gen/endpoints/repositories/repositories";
import { useAssignResourcesContent } from "@/gen/endpoints/resources/resources";
import type { WorkspaceResourceDto, RepositoryDto } from "@/gen/model";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, FolderTree, FileCode, Check, Loader2, GitBranch, Layers } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LinkContentResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    contentId: string;
    contentName: string;
    projectId: string;
  };
}

export function LinkContentResourcesDialog({
  open,
  onOpenChange,
  data,
}: LinkContentResourcesDialogProps) {
  const { contentId, contentName, projectId } = data || {};

  // Fetch repositories for current project
  const { data: repositories = [], isLoading: isRepositoriesLoading } = useRepositories(projectId);

  // Selected repository state (default to first repository)
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const activeRepoId = selectedRepoId || (repositories[0]?.id ? String(repositories[0].id) : "");

  const [keyword, setKeyword] = useState("");
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [hideAlreadyAssigned, setHideAlreadyAssigned] = useState(true);

  // Fetch resources for selected repository
  const { data: resourcesData, isLoading: isResourcesLoading, refetch } = useGetRepositoryResources(
    activeRepoId,
    {
      projectId,
      workspaceId: activeRepoId,
      page: 1,
      pageSize: 50,
      globalKeyword: keyword.trim() || undefined,
    },
    {
      query: {
        enabled: !!activeRepoId,
      },
    }
  );

  const assignMutation = useAssignResourcesContent();

  const rawResources: WorkspaceResourceDto[] = (resourcesData?.items || []) as WorkspaceResourceDto[];

  // Filter items based on already assigned toggle
  const filteredResources = useMemo(() => {
    if (!hideAlreadyAssigned) return rawResources;
    return rawResources.filter((item: WorkspaceResourceDto) => !item.contentId || item.contentId === contentId);
  }, [rawResources, hideAlreadyAssigned, contentId]);

  const handleToggleSelect = (resourceId: string) => {
    setSelectedResourceIds((prev) =>
      prev.includes(resourceId) ? prev.filter((id) => id !== resourceId) : [...prev, resourceId]
    );
  };

  const handleSelectAll = () => {
    if (selectedResourceIds.length === filteredResources.length) {
      setSelectedResourceIds([]);
    } else {
      setSelectedResourceIds(filteredResources.map((r) => r.id));
    }
  };

  const handleLink = () => {
    if (selectedResourceIds.length === 0) {
      toast.warning("Please select at least one resource to link.");
      return;
    }

    assignMutation.mutate(
      {
        data: {
          resourceIds: selectedResourceIds,
          contentId: contentId,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Successfully linked ${selectedResourceIds.length} resource(s) to "${contentName}".`);
          setSelectedResourceIds([]);
          refetch();
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to link resources.");
        },
      }
    );
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Link Resources to "${contentName || "Content Item"}"`}
      description="Select resources from project workspaces to attach to this content item."
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-muted-foreground">
            Selected: <strong className="text-foreground">{selectedResourceIds.length}</strong> resource(s)
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              isDisabled={selectedResourceIds.length === 0 || assignMutation.isPending}
              onClick={handleLink}
              className="gap-1.5"
            >
              {assignMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              <Check className="size-3.5" />
              Link Selected ({selectedResourceIds.length})
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {/* Repository selector tabs / pills */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Select Repository
          </label>
          {isRepositoriesLoading ? (
            <div className="h-8 rounded bg-muted animate-pulse" />
          ) : repositories.length > 0 ? (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {repositories.map((repo: RepositoryDto) => {
                const isSelected = (activeRepoId || repositories[0]?.id) === repo.id;
                return (
                  <Button
                    key={repo.id}
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => {
                      setSelectedRepoId(repo.id);
                      setSelectedResourceIds([]);
                    }}
                    className={cn(
                      "h-8 px-3 text-xs gap-1.5 shrink-0 rounded-lg",
                      isSelected && "shadow-xs"
                    )}
                  >
                    <FolderTree className="size-3.5" />
                    {repo.name}
                    <span className="ml-1 text-[10px] opacity-75 font-mono">
                      ({repo.resourceCount ?? 0})
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No repositories found in this project.</p>
          )}
        </div>

        {/* Toolbar: Search and Filter */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search resource name, path..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/20"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
            <Checkbox
              isSelected={hideAlreadyAssigned}
              onChange={(isSelected) => setHideAlreadyAssigned(isSelected)}
            />
            <span>Unassigned only</span>
          </label>
        </div>

        {/* Resources list table / cards */}
        <div className="border rounded-xl bg-card overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
            <div className="flex items-center gap-2">
              <Checkbox
                isSelected={
                  filteredResources.length > 0 &&
                  selectedResourceIds.length === filteredResources.length
                }
                onChange={handleSelectAll}
                aria-label="Select all"
              />
              <span>Resource ({filteredResources.length})</span>
            </div>
            <span>Status</span>
          </div>

          {/* Body list */}
          <div className="max-h-[340px] overflow-y-auto divide-y divide-border">
            {isResourcesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span className="text-xs">Loading resources...</span>
              </div>
            ) : filteredResources.length > 0 ? (
              filteredResources.map((item) => {
                const isSelected = selectedResourceIds.includes(item.id);
                const isAssignedToThis = item.contentId === contentId;
                const isAssignedToOther = item.contentId && item.contentId !== contentId;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggleSelect(item.id)}
                    className={cn(
                      "flex items-center justify-between p-2.5 hover:bg-muted/30 cursor-pointer transition-colors text-xs",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Checkbox
                        isSelected={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${item.displayName}`}
                      />
                      <div className="size-7 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileCode className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground truncate">
                            {item.displayName}
                          </span>
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-muted text-[10px] font-mono text-muted-foreground">
                            <GitBranch className="size-2.5" />
                            v{item.versionCount || 1}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate block">
                          {item.relativePath || item.displayName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isAssignedToThis ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-[10px]">
                          Already Linked
                        </span>
                      ) : isAssignedToOther ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium text-[10px] truncate max-w-[120px]">
                          Linked: {item.contentName || "Other"}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium text-[10px]">
                          Available
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-1.5">
                <Layers className="size-6 text-muted-foreground/60" />
                <p className="text-xs font-semibold text-foreground">No resources available</p>
                <p className="text-[11px] text-muted-foreground">
                  {keyword ? `No files matching "${keyword}"` : "This workspace has no resources."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
