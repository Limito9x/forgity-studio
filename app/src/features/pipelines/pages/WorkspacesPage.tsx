import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FolderGit2,
  FolderOpen,
  Plus,
  Trash2,
  ExternalLink,
  Workflow,
  Sparkles,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  useWorkspaceRegistry,
  type RegisteredWorkspace,
} from "../hooks/workspace/useWorkspaceRegistry";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { toast } from "sonner";

export function WorkspacesPage() {
  const navigate = useNavigate();
  const {
    workspaces,
    isLoading,
    registerWorkspace,
    removeWorkspace,
    touchWorkspace,
  } = useWorkspaceRegistry();

  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  const handleOpenFolder = async () => {
    if (!isTauriRuntime()) {
      toast.error("Opening local workspaces is only supported on Desktop (Tauri).");
      return;
    }

    try {
      setIsOpeningFolder(true);
      const selected = await openNativeFileOrFolderDialog({
        mode: "folder",
        title: "Select Workspace Folder",
      });

      if (!selected) return;

      const folderName =
        selected.split(/[/\\]/).filter(Boolean).pop() || "Local Workspace";

      const registered = await registerWorkspace({
        name: folderName,
        rootPath: selected,
      });

      toast.success(`Registered workspace "${registered.name}"`);
      navigate({
        to: "/workspaces/$workspaceId" as any,
        params: { workspaceId: registered.id } as any,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to open folder as workspace.");
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleSelectWorkspace = async (ws: RegisteredWorkspace) => {
    await touchWorkspace(ws.id);
    navigate({
      to: "/workspaces/$workspaceId" as any,
      params: { workspaceId: ws.id } as any,
    });
  };

  return (
    <div className="page-container max-w-6xl py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
            <Badge variant="outline" className="text-xs">
              Desktop Local
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your independent pipeline workspaces and forked templates stored on this workstation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onPress={handleOpenFolder}
            isDisabled={isOpeningFolder}
            className="gap-1.5 cursor-pointer"
          >
            <FolderOpen className="size-4 text-emerald-500" />
            <span>Open Folder</span>
          </Button>

          <Button
            onPress={() => navigate({ to: "/templates" as any })}
            className="gap-1.5 cursor-pointer"
          >
            <Sparkles className="size-4" />
            <span>Fork Template</span>
          </Button>
        </div>
      </div>

      {/* Grid of Workspaces */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Loading registered workspaces...
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center space-y-4 bg-muted/20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FolderGit2 className="size-7" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-semibold">No workspaces registered</h3>
            <p className="text-xs text-muted-foreground">
              You haven&apos;t opened or forked any pipeline workspaces on this computer yet. Open an existing workspace folder or fork a template from the Catalog.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button variant="outline" size="sm" onPress={handleOpenFolder}>
              <FolderOpen className="mr-1.5 size-3.5" />
              Open Existing Folder
            </Button>
            <Button size="sm" onPress={() => navigate({ to: "/templates" as any })}>
              <Plus className="mr-1.5 size-3.5" />
              Explore Templates
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <Card
              key={ws.id}
              className="group relative flex flex-col justify-between hover:border-primary/50 hover:shadow-md transition-all cursor-pointer overflow-hidden"
              onClick={() => handleSelectWorkspace(ws)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {ws.originTemplateId ? (
                        <Sparkles className="size-4.5 text-amber-500" />
                      ) : (
                        <Workflow className="size-4.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                        {ws.name}
                      </CardTitle>
                      <CardDescription className="text-[11px] truncate font-mono">
                        {ws.rootPath}
                      </CardDescription>
                    </div>
                  </div>

                  <span title="Remove from registry">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onPress={(e) => {
                        (e as any)?.stopPropagation?.();
                        removeWorkspace(ws.id);
                      }}
                      aria-label="Remove from registry"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </div>
              </CardHeader>

              <CardContent className="pt-0 pb-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {ws.originTemplateTitle ? (
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                      Forked: {ws.originTemplateTitle}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Local Folder
                    </Badge>
                  )}
                  {ws.linkedProjectId && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Project Linked
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-2 mt-1">
                  <span className="flex items-center gap-1">
                    <HardDrive className="size-3 text-emerald-500" />
                    Local Storage
                  </span>
                  <span className="flex items-center gap-1 text-primary font-medium group-hover:underline">
                    Open <ExternalLink className="size-3" />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
