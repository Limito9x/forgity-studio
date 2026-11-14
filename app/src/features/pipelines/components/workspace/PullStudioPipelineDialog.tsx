import { useState } from "react";
import { CloudDownload, Loader2, AlertCircle, ArrowRight, CheckSquare, Square } from "lucide-react";
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
import { usePipelines } from "../../hooks/usePipelines";
import { getPipelineGraph } from "@/gen/endpoints/pipelines/pipelines";
import { graphToPipelineYaml } from "../../utils/pipelineDslConverter";
import { useLocalWorkspaceConfig, useLocalPipelinesQuery, saveLocalPipelineSnapshot } from "../../hooks/workspace";
import type { ExtendedPipelineGraphDto } from "../../hooks/usePipelineGraph";
import type { ScannedPipelineYamlItemRust } from "../../types/workspaceConfig";

interface PullStudioPipelineDialogProps {
  projectId?: string;
  isOpen?: boolean;
  onClose?: () => void;
  onPulled?: (draft: ScannedPipelineYamlItemRust) => void;
  // Standard DialogProps support
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  data?: { projectId: string };
}

export function PullStudioPipelineDialog(props: PullStudioPipelineDialogProps) {
  const projectId = props.data?.projectId || props.projectId || "";
  const isDialogActive = props.open ?? props.isOpen ?? false;
  const handleClose = () => {
    props.onOpenChange?.(false);
    props.onClose?.();
  };
  const onPulled = props.onPulled;

  const { data: pipelines = [], isLoading: isLoadingList, error } = usePipelines(projectId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPulling, setIsPulling] = useState(false);

  const { rootPath, config } = useLocalWorkspaceConfig(projectId);
  const { refetch: refetchPipelines } = useLocalPipelinesQuery(rootPath, config?.pipelinesDir);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === pipelines.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pipelines.map((p) => p.id)));
    }
  };

  const handlePullPipelines = async () => {
    if (selectedIds.size === 0 || !rootPath) return;
    setIsPulling(true);

    const pipelinesDir = config?.pipelinesDir || "pipelines";
    const selectedList = pipelines.filter((p) => selectedIds.has(p.id));
    let lastPulledDraft: ScannedPipelineYamlItemRust | null = null;
    let successCount = 0;

    try {
      await Promise.all(
        selectedList.map(async (meta) => {
          try {
            const graphDto = (await getPipelineGraph(meta.id)) as ExtendedPipelineGraphDto;
            if (!graphDto || !graphDto.nodes) return;

            const rawName = graphDto.name || meta.name || "pipeline";
            const fileSlug =
              rawName
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_|_$/g, "") || "pipeline";

            // Save Snapshot (.forgity/snapshots/<slug>.snap.json)
            await saveLocalPipelineSnapshot(rootPath, fileSlug, JSON.stringify(graphDto, null, 2));

            // Compile to Declarative YAML DSL
            const yamlContent = graphToPipelineYaml(
              graphDto.name || meta.name,
              graphDto.nodes as any,
              graphDto.edges as any
            );

            // Save .pipeline.yaml via Tauri IPC
            const normalizedRoot = rootPath.replace(/[/\\]+$/, "");
            const normalizedDir = pipelinesDir === "." ? "" : `/${pipelinesDir.replace(/^[/\\]+/, "")}`;
            const fullPath = `${normalizedRoot}${normalizedDir}/${fileSlug}.pipeline.yaml`.replace(/\\/g, "/");
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("save_local_pipeline_draft", {
              filePath: fullPath,
              content: yamlContent,
            });

            lastPulledDraft = {
              fileName: `${fileSlug}.pipeline.yaml`,
              relativePath: `${pipelinesDir}/${fileSlug}.pipeline.yaml`,
              fullPath,
              content: yamlContent,
              lastModifiedMs: Date.now(),
              pipelineKind: "master",
              executor: undefined,
            };
            successCount++;
          } catch (itemErr) {
            console.error(`Failed to pull pipeline "${meta.name}":`, itemErr);
          }
        })
      );

      await refetchPipelines();
      if (lastPulledDraft) {
        onPulled?.(lastPulledDraft);
      }

      toast.success(
        successCount === 1
          ? `Pipeline "${selectedList[0]?.name}" pulled successfully!`
          : `Pulled ${successCount} pipelines into local workspace!`
      );
      setSelectedIds(new Set());
      handleClose();
    } catch (err: any) {
      toast.error("Failed to pull pipelines", {
        description: err?.message || "Unknown error",
      });
    } finally {
      setIsPulling(false);
    }
  };

  const allSelected = pipelines.length > 0 && selectedIds.size === pipelines.length;

  return (
    <Dialog isOpen={isDialogActive} onOpenChange={(open: boolean) => !open && handleClose()} className="sm:max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CloudDownload className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">Pull Pipelines from Studio</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Fetch graph templates from Studio Cloud into your local workspace.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-3 py-1">
        {isLoadingList ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Loading Studio pipelines...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to load pipelines from Studio Cloud.</span>
          </div>
        ) : pipelines.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No pipelines found in this Studio Project.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>{pipelines.length} available pipelines</span>
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
              >
                {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                <span>{allSelected ? "Deselect All" : "Select All"}</span>
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/30">
              {pipelines.map((p) => {
                const isSelected = selectedIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => handleToggleSelect(p.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer text-xs ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="shrink-0 text-primary">
                        {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-foreground block truncate">
                          {p.name}
                        </span>
                      </div>
                    </div>

                    <Badge variant="outline" className="text-[10px] shrink-0 font-mono ml-2">
                      {p.nodeCount ?? 0} nodes
                    </Badge>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <DialogFooter className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
        <span className="text-xs text-muted-foreground font-medium">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : "None selected"}
        </span>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onPress={handleClose} isDisabled={isPulling} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onPress={handlePullPipelines}
            isDisabled={selectedIds.size === 0 || isPulling}
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
          >
            {isPulling ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Pulling ({selectedIds.size})...</span>
              </>
            ) : (
              <>
                <span>Pull ({selectedIds.size}) to Local</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}

