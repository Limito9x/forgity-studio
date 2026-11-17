import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, Sparkles, Loader2, Workflow, HardDrive } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { toast } from "sonner";
import type { TemplateContainerDetailDto } from "@/gen/model/templateContainerDetailDto";

interface ForkTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  template: TemplateContainerDetailDto;
}

export function ForkTemplateDialog({
  isOpen,
  onClose,
  template,
}: ForkTemplateDialogProps) {
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState(
    `${template.title} Workspace`
  );
  const [targetRootPath, setTargetRootPath] = useState("");
  const [isForking, setIsForking] = useState(false);

  const handleBrowseTargetFolder = async () => {
    if (!isTauriRuntime()) {
      toast.error("Local Workspace fork is only supported on Desktop (Tauri).");
      return;
    }

    try {
      const selected = await openNativeFileOrFolderDialog({
        mode: "folder",
        title: "Select Parent Folder for Workspace",
      });

      if (!selected) return;

      // Suggest creating a subfolder named after the workspace
      const sanitizedName = workspaceName
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      const fullPath = `${selected.replace(/[/\\]$/, "")}/${sanitizedName || "workspace"}`;
      setTargetRootPath(fullPath);
    } catch (err: any) {
      toast.error(err?.message || "Failed to select folder.");
    }
  };

  const handleExecuteFork = async () => {
    if (!isTauriRuntime()) {
      toast.error("Local Workspace fork is only supported on Desktop (Tauri).");
      return;
    }

    if (!targetRootPath.trim()) {
      toast.error("Please choose a target directory for the workspace.");
      return;
    }

    try {
      setIsForking(true);

      // Extract pipeline files to stage from template members
      const pipelines = template.members.map((m) => {
        const isMaster = m.role === "master";
        const fileName = `${m.slug}.${isMaster ? "pipeline" : "component"}.yaml`;
        return {
          fileName,
          relativePath: `pipelines/${fileName}`,
          pipelineKind: isMaster ? "master" : "component",
          yamlContent: (m as any).dagYaml || "",
          snapshotJson: null,
        };
      });

      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        workspaceId: string;
        rootPath: string;
        stagedPipelines: number;
        stagedAssets: number;
      }>("fork_template_workspace", {
        params: {
          targetRootPath,
          workspaceName: workspaceName.trim() || template.title,
          templateId: template.templatePackageId,
          versionId: template.primaryMasterVersionId || (template.members[0]?.pipelineVersionId ?? ""),
          templateTitle: template.title,
          pipelines,
          paletteJson: template.paletteNodesJson ? JSON.stringify(template.paletteNodesJson) : null,
          structsJson: null,
          constantsJson: template.constants ? JSON.stringify(template.constants) : null,
          assets: [],
        },
      });

      toast.success(
        `Forked template into "${result.rootPath}" (${result.stagedPipelines} pipelines staged)`
      );

      onClose();
      navigate({
        to: "/workspaces/$workspaceId" as any,
        params: { workspaceId: result.workspaceId } as any,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to fork template to local workspace.");
    } finally {
      setIsForking(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && !isForking && onClose()}
      className="sm:max-w-lg p-6 gap-5"
    >
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Sparkles className="size-4" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              Fork Template to Local Workspace
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Create an independent workstation workspace initialized from &quot;{template.title}&quot; v{template.versionNumber}.
            </p>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Workspace Name */}
        <div className="space-y-1.5">
          <Label htmlFor="ws-name" className="text-xs font-medium">
            Workspace Name
          </Label>
          <Input
            id="ws-name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="e.g. My Cinematic Project"
            className="text-xs h-9"
            disabled={isForking}
          />
        </div>

        {/* Target Location */}
        <div className="space-y-1.5">
          <Label htmlFor="ws-path" className="text-xs font-medium">
            Target Folder on Computer
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="ws-path"
              value={targetRootPath}
              onChange={(e) => setTargetRootPath(e.target.value)}
              placeholder="Choose or paste target folder path..."
              className="text-xs h-9 font-mono"
              disabled={isForking}
            />
            <Button
              variant="outline"
              size="sm"
              onPress={handleBrowseTargetFolder}
              isDisabled={isForking}
              className="h-9 shrink-0 gap-1 text-xs"
            >
              <FolderOpen className="size-3.5 text-emerald-500" />
              Browse
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A new folder with pipelines, assets, and SQLite workspace index will be created here.
          </p>
        </div>

        {/* Summary Box */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Workflow className="size-3.5" />
              Pipelines to stage:
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {template.members.length} ({template.members.filter(m => m.role === 'master').length} Master, {template.members.filter(m => m.role !== 'master').length} Components)
            </Badge>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HardDrive className="size-3.5" />
              Execution Mode:
            </span>
            <span className="font-medium text-foreground">
              Desktop Local Runner (RAM In-Memory)
            </span>
          </div>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="ghost" size="sm" onPress={onClose} isDisabled={isForking}>
          Cancel
        </Button>
        <Button
          size="sm"
          onPress={handleExecuteFork}
          isDisabled={isForking || !targetRootPath.trim()}
          className="gap-1.5"
        >
          {isForking ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Forking Workspace...</span>
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              <span>Fork & Open Workspace</span>
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
