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
import { useQueryClient } from "@tanstack/react-query";
import type { TemplateContainerDetailDto } from "@/gen/model/templateContainerDetailDto";
import { graphToPipelineYaml } from "../utils/pipelineDslConverter";
import { getCloudDataPipelineVersion } from "@/gen/endpoints/cloud-data/cloud-data";
import { addTemplateToLibrary, getGetMyLibraryQueryKey } from "@/gen/endpoints/templates/templates";

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
  const queryClient = useQueryClient();
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

      // If opened from Workbench shim without full containerManifestJson, fetch detail from API
      let effectiveManifestJson = (template as any).containerManifestJson;
      if (!effectiveManifestJson && template.templatePackageId) {
        try {
          const { getTemplateContainerById } = await import("@/gen/endpoints/templates/templates");
          const detailRes = await getTemplateContainerById(template.templatePackageId);
          if (detailRes?.containerManifestJson) {
            effectiveManifestJson = detailRes.containerManifestJson;
          }
        } catch (detailErr) {
          console.warn("[ForkTemplateDialog] Could not fetch template detail for containerManifestJson:", detailErr);
        }
      }

      // Collect template assets from manifest & node configValues, download bytes, and remap pins -> workspace://assets/<fileName>
      const assetsToDownload = new Map<
        string,
        { fileName: string; downloadUrl: string; sha256?: string }
      >();

      const manifestAssets = Array.isArray(effectiveManifestJson?.assets)
        ? (effectiveManifestJson.assets as any[])
        : [];
      for (const a of manifestAssets) {
        const fileName = a?.name || a?.fileName;
        const downloadUrl = a?.downloadUrl || a?.publicUrl;
        if (typeof fileName === "string" && fileName && typeof downloadUrl === "string" && downloadUrl) {
          assetsToDownload.set(fileName, {
            fileName,
            downloadUrl,
            sha256: typeof a?.sha256 === "string" ? a.sha256 : undefined,
          });
        }
      }

      const remapNodeAssets = (nodes: any[]) => {
        for (const node of nodes) {
          if (!node || typeof node !== "object") continue;
          const configValues = node.configValues;
          if (!configValues || typeof configValues !== "object") continue;
          for (const [pinId, val] of Object.entries(configValues)) {
            if (val && typeof val === "object" && !Array.isArray(val)) {
              const obj = val as Record<string, any>;
              const fileName = obj.fileName || obj.originalName || obj.filename;
              const downloadUrl = obj.publicUrl || obj.url || obj.downloadUrl;
              if ((obj.kind === "template_asset" || obj.assetId) && typeof fileName === "string" && fileName) {
                if (typeof downloadUrl === "string" && downloadUrl && !assetsToDownload.has(fileName)) {
                  assetsToDownload.set(fileName, {
                    fileName,
                    downloadUrl,
                    sha256: typeof obj.sha256 === "string" ? obj.sha256 : undefined,
                  });
                }
                configValues[pinId] = `workspace://assets/${fileName}`;
              }
            }
          }
        }
      };

      // Option 2: Build declarative YAML directly from Snapshot (dagBundleJson)
      const pipelines = await Promise.all(
        template.members.map(async (m) => {
          const isMaster = m.role === "master";
          const kind = isMaster ? "master" : "component";
          const fileName = `${m.slug}.${isMaster ? "pipeline" : "component"}.yaml`;

          let dagBundle: any = (m as any).dagBundleJson
            ? JSON.parse(JSON.stringify((m as any).dagBundleJson))
            : null;
          if (!dagBundle && m.pipelineVersionId) {
            try {
              const res = await getCloudDataPipelineVersion(m.pipelineVersionId);
              dagBundle = res.dagBundleJson
                ? JSON.parse(JSON.stringify(res.dagBundleJson))
                : null;
            } catch (fetchErr) {
              console.warn(`Could not fetch dagBundleJson for member ${m.slug}:`, fetchErr);
            }
          }

          const rootPipeline = dagBundle?.rootPipeline ?? dagBundle;
          const nodes = Array.isArray(rootPipeline?.nodes) ? rootPipeline.nodes : [];
          const edges = Array.isArray(rootPipeline?.edges) ? rootPipeline.edges : [];
          remapNodeAssets(nodes);
          if (dagBundle?.components && typeof dagBundle.components === "object") {
            for (const comp of Object.values(dagBundle.components) as any[]) {
              if (Array.isArray(comp?.nodes)) remapNodeAssets(comp.nodes);
            }
          }

          // Generate valid declarative YAML from AST nodes and edges
          let yamlContent = "";
          if (nodes.length > 0) {
            yamlContent = graphToPipelineYaml(
              m.slug,
              nodes,
              edges,
              undefined,
              kind as "master" | "component"
            );
          } else if ((m as any).dagYaml) {
            yamlContent = (m as any).dagYaml;
          } else {
            // Minimal valid fallback YAML structure
            yamlContent = `name: ${m.slug}\nkind: ${kind}\nnodes: []\nedges: []\n`;
          }

          const snapshotJson = dagBundle ? JSON.stringify(dagBundle) : null;

          return {
            fileName,
            relativePath: `pipelines/${fileName}`,
            pipelineKind: kind,
            yamlContent,
            snapshotJson,
          };
        })
      );

      // Serialize constants with non-null values if present in manifest/declaration
      const constantsList = (template.constants || []).map((c: any) => {
        let value = null;
        if (c.defaultValue !== undefined && c.defaultValue !== null && c.defaultValue !== "") {
          if (typeof c.defaultValue === "string") {
            try {
              // Parse nếu là JSON string kép ("\"path\"" -> "path", hoặc "{...}", "[...]")
              value = JSON.parse(c.defaultValue);
            } catch {
              value = c.defaultValue;
            }
          } else {
            value = c.defaultValue;
          }
        }
        return {
          id: c.id || c.key,
          key: c.key,
          value,
          dataType: c.dataType || "String",
          scope: c.scope || "General",
          description: c.description || "",
        };
      });

      const stagedAssetPayloads = await Promise.all(
        Array.from(assetsToDownload.values()).map(async (asset) => {
          const resp = await fetch(asset.downloadUrl);
          if (!resp.ok) {
            throw new Error(`Failed to download template asset "${asset.fileName}" (${resp.status}).`);
          }
          const buf = new Uint8Array(await resp.arrayBuffer());
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < buf.length; i += chunkSize) {
            binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
          }
          return {
            fileName: asset.fileName,
            relativePath: `assets/${asset.fileName}`,
            sha256: asset.sha256 ?? null,
            dataBase64: btoa(binary),
          };
        })
      );

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
          templateSlug: (template as any).slug ?? null,
          versionId: template.primaryMasterVersionId || (template.members[0]?.pipelineVersionId ?? ""),
          templateTitle: template.title,
          pipelines,
          paletteJson: template.paletteNodesJson ? JSON.stringify(template.paletteNodesJson) : null,
          structsJson: null,
          constantsJson: JSON.stringify(constantsList),
          assets: stagedAssetPayloads,
        },
      });

      // Auto add template to user library if not already added
      try {
        await addTemplateToLibrary(template.templatePackageId, {
          machineKey: "local-workstation",
        });
        queryClient.invalidateQueries({ queryKey: getGetMyLibraryQueryKey() });
      } catch {
        // non-blocking if already added or offline
      }

      toast.success(
        `Forked template into "${result.rootPath}" (${result.stagedPipelines} pipelines, ${result.stagedAssets} assets staged)`
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
