import { useGetResourcesByContent, useAssignResourcesContent } from "@/gen/endpoints/resources/resources";
import { FileCode, GitBranch, HardDrive, Unlink, Loader2, FolderTree, Layers, Plus, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogStore } from "@/stores/dialogStore";
import { toast } from "sonner";
import { useMemo } from "react";

interface ContentResourcesTabProps {
  contentId: string;
  contentName?: string;
  projectId?: string;
}

export function ContentResourcesTab({ contentId, contentName, projectId }: ContentResourcesTabProps) {
  const { data: resources, isLoading, refetch } = useGetResourcesByContent(contentId);
  const assignMutation = useAssignResourcesContent();
  const openDialog = useDialogStore((state) => state.openDialog);

  const handleOpenLinkDialog = () => {
    if (!projectId) {
      toast.warning("Project context is required to link resources.");
      return;
    }
    openDialog("link-content-resources", {
      contentId,
      contentName: contentName || "Content Item",
      projectId,
    });
  };

  const handleUnlink = (resourceId: string, resourceName: string) => {
    assignMutation.mutate(
      {
        data: {
          resourceIds: [resourceId],
          contentId: null,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Unlinked "${resourceName}" from this content.`);
          refetch();
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to unlink resource.");
        },
      }
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const totalSizeBytes = useMemo(() => {
    if (!resources) return 0;
    return resources.reduce((acc: number, item: any) => acc + (item.latestSizeBytes || 0), 0);
  }, [resources]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs">Loading linked resources...</p>
      </div>
    );
  }

  if (!resources || resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center border border-dashed rounded-xl bg-card/50 space-y-4">
        <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Layers className="size-6" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h4 className="font-semibold text-sm text-foreground">No resources linked yet</h4>
          <p className="text-xs text-muted-foreground">
            Link workspace files (3D models, textures, animations, scripts) to this content item for centralized tracking.
          </p>
        </div>
        {projectId && (
          <Button
            size="sm"
            onClick={handleOpenLinkDialog}
            className="gap-1.5 h-8 text-xs font-medium"
          >
            <Plus className="size-3.5" />
            Link Resources
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Header & Stats */}
      <div className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Link2 className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                {resources.length} Linked Resource{resources.length > 1 ? "s" : ""}
              </span>
              {totalSizeBytes > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  ({formatBytes(totalSizeBytes)})
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Files linked to &ldquo;{contentName || "this content item"}&rdquo;
            </p>
          </div>
        </div>

        {projectId && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenLinkDialog}
            className="h-7 px-2.5 text-xs gap-1.5 bg-background shadow-xs hover:bg-muted"
          >
            <Plus className="size-3.5" />
            Link More
          </Button>
        )}
      </div>

      {/* List of Resource Cards */}
      <div className="grid grid-cols-1 gap-2">
        {resources.map((item: any) => (
          <div
            key={item.id}
            className="group flex items-center justify-between p-3 rounded-xl border bg-card hover:border-primary/40 hover:shadow-xs transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-8 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center shrink-0 transition-colors">
                <FileCode className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm text-foreground truncate">
                    {item.displayName}
                  </h4>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono font-medium text-foreground">
                    <GitBranch className="size-2.5 text-muted-foreground" />
                    v{item.latestVersionNo || 1}
                  </span>
                  {item.versionCount > 1 && (
                    <span className="text-[10px] text-muted-foreground">
                      ({item.versionCount} versions)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1 truncate max-w-xs">
                    <FolderTree className="size-3 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground/80">{item.workspaceName}</span>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="truncate">{item.relativePath}</span>
                  </span>
                  {item.latestSizeBytes > 0 && (
                    <span className="flex items-center gap-1 shrink-0">
                      <HardDrive className="size-3 text-muted-foreground" />
                      {formatBytes(item.latestSizeBytes)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant="ghost"
              isDisabled={assignMutation.isPending}
              onClick={() => handleUnlink(item.id, item.displayName)}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 px-2 text-xs gap-1.5 shrink-0 transition-colors"
            >
              <Unlink className="size-3" />
              Unlink
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
