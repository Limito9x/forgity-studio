import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Package,
  UploadCloud,
  FileCode,
  Loader2,
  Workflow,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { graphToPipelineYaml } from "../../utils/pipelineDslConverter";
import type { PipelinePackageDto } from "../../hooks/usePipelineExportImport";
import type { ScannedPipelineYamlItemRust } from "../../types/workspaceConfig";

interface UnpackLocalPackageDialogProps {
  rootPath?: string | null;
  isOpen?: boolean;
  onClose?: () => void;
  onUnpacked?: (firstDraft?: ScannedPipelineYamlItemRust) => void;
  // Standard DialogProps support
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  data?: any;
}

export function UnpackLocalPackageDialog(props: UnpackLocalPackageDialogProps) {
  const rootPath = props.rootPath || null;
  const isDialogActive = props.open ?? props.isOpen ?? false;
  const handleClose = () => {
    props.onOpenChange?.(false);
    props.onClose?.();
  };
  const onUnpacked = props.onUnpacked;
  const [file, setFile] = useState<File | null>(null);
  const [packageData, setPackageData] = useState<PipelinePackageDto | null>(null);
  const [isUnpacking, setIsUnpacking] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text) as PipelinePackageDto;
        if (!parsed.pipelines || !Array.isArray(parsed.pipelines)) {
          toast.error("Invalid package format: Missing pipelines array");
          setFile(null);
          setPackageData(null);
          return;
        }
        setPackageData(parsed);
      } catch (err: any) {
        toast.error("Failed to parse package JSON", {
          description: err.message,
        });
        setFile(null);
        setPackageData(null);
      }
    };
    reader.readAsText(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json", ".pipeline.json"],
    },
    maxFiles: 1,
  });

  const handleUnpack = async () => {
    if (!packageData) return;
    setIsUnpacking(true);

    let successCount = 0;

    try {
      for (const p of packageData.pipelines) {
        const rawName = p.name || "unpacked_pipeline";
        const fileSlug =
          rawName
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "") || "pipeline";

        // Convert package node/edge structure to standard ExtendedPipelineGraphDto for snapshot
        const snapshotGraph = {
          name: p.name,
          version: "unpacked",
          nodes: (p.graph?.nodes || []).map((n) => ({
            id: n.tempId,
            type: n.kind,
            refId: n.refId,
            label: n.label,
            position: n.position || { x: 100, y: 100 },
            size: n.size,
            parentId: n.parentTempId,
            config: n.configValues || {},
            resolvedPins: {
              inputs: n.inputs || [],
              outputs: n.outputs || [],
            },
          })),
          edges: (p.graph?.edges || []).map((e: any) => ({
            id: e.tempId || `${e.sourceNodeTempId || e.sourcePipelineNodeId}:${e.sourcePin || e.sourcePinId}->${e.targetNodeTempId || e.targetPipelineNodeId}:${e.targetPin || e.targetPinId}`,
            kind: e.kind || "Data",
            sourceNodeId: e.sourceNodeTempId || e.sourcePipelineNodeId,
            sourcePinId: e.sourcePin || e.sourcePinId,
            targetNodeId: e.targetNodeTempId || e.targetPipelineNodeId,
            targetPinId: e.targetPin || e.targetPinId,
          })),
        };

        // 1. Save Snapshot via Tauri IPC (.forgity/snapshots/<slug>.snap.json)
        const { invoke } = await import("@tauri-apps/api/core");
        if (rootPath) {
          await invoke("save_pipeline_snapshot", {
            rootPath,
            pipelineSlug: fileSlug,
            snapshotJson: JSON.stringify(snapshotGraph, null, 2),
          });
        }

        // 2. Compile to Declarative YAML DSL
        const yamlContent = graphToPipelineYaml(
          p.name,
          snapshotGraph.nodes as any,
          snapshotGraph.edges as any
        );

        // 3. Save .pipeline.yaml
        const pipelinesDir = rootPath ? `${rootPath}/pipelines` : "pipelines";
        const fullPath = `${pipelinesDir}/${fileSlug}.pipeline.yaml`.replace(/\\/g, "/");
        await invoke("save_local_pipeline_draft", {
          filePath: fullPath,
          content: yamlContent,
        });
        successCount++;
      }

      toast.success(
        successCount === 1
          ? `Package unpacked successfully into "${packageData.pipelines[0]?.name}"!`
          : `Unpacked ${successCount} pipelines into workspace!`
      );
      onUnpacked?.();
      handleClose();
    } catch (err: any) {
      toast.error("Failed to unpack package into workspace", {
        description: err.message,
      });
    } finally {
      setIsUnpacking(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPackageData(null);
  };

  return (
    <Dialog isOpen={isDialogActive} onOpenChange={(open: boolean) => !open && handleClose()} className="sm:max-w-lg">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">Unpack Package to Workspace</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Extract a Forgity package (.json) into your local pipelines and snapshots.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="py-3">
        {!packageData ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border/70 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <UploadCloud className="h-8 w-8 text-primary/70 animate-bounce" />
              <p className="text-sm font-medium text-foreground">
                Drag & drop package file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Supports .json or .pipeline.json bundle packages
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <FileCode className="h-5 w-5 text-primary shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-semibold truncate">{file?.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Contains {packageData.pipelines.length} pipeline(s)
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onPress={handleReset}
              >
                Change
              </Button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-lg border bg-card text-xs">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Pipelines in package:
              </p>
              {packageData.pipelines.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/40"
                >
                  <span className="font-medium flex items-center gap-1.5">
                    <Workflow className="h-3.5 w-3.5 text-primary" />
                    {p.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                      {p.graph?.nodes?.length || 0} nodes
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="ghost" size="sm" onPress={handleClose} isDisabled={isUnpacking}>
          Cancel
        </Button>
        <Button
          size="sm"
          onPress={handleUnpack}
          isDisabled={!packageData || isUnpacking}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs shadow-xs"
        >
          {isUnpacking ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Unpacking...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Unpack to Workspace
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
