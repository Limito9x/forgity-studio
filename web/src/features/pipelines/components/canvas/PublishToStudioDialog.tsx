import { useState } from "react";
import { UploadCloud, CheckCircle2, FileCode, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Node, Edge } from "@xyflow/react";
import { useLocalPaletteQuery } from "../../hooks/workspace";
import { usePublishDraftPipelineMutation, type PublishLocalScriptItem } from "../../hooks/usePublishDraftPipeline";

interface PublishToStudioDialogProps {
  projectId: string;
  rootPath?: string | null;
  pipelineId?: string;
  initialName: string;
  nodes: Node[];
  edges: Edge[];
  parameters?: any[];
  isOpen: boolean;
  onClose: () => void;
  onPublished?: (publishedPipelineId: string) => void;
}

export function PublishToStudioDialog({
  projectId,
  rootPath = null,
  pipelineId,
  initialName,
  nodes,
  edges,
  parameters,
  isOpen,
  onClose,
  onPublished,
}: PublishToStudioDialogProps) {
  const [pipelineName, setPipelineName] = useState(initialName || "Published Pipeline");
  const [description, setDescription] = useState("");
  const { draftNodes } = useLocalPaletteQuery(rootPath);
  const publishMutation = usePublishDraftPipelineMutation();

  // Find all local draft nodes used in the current graph
  const usedLocalScripts: PublishLocalScriptItem[] = [];
  const localKeysSet = new Set<string>();

  for (const n of nodes) {
    if (n.type === "scopeContainer") continue;
    const refId = String(n.data?.refId || "");
    if (refId.startsWith("local:")) {
      const cleanKey = refId.slice(6);
      if (!localKeysSet.has(cleanKey)) {
        localKeysSet.add(cleanKey);
        const localDraft = draftNodes[cleanKey];
        if (localDraft) {
          usedLocalScripts.push({
            key: cleanKey,
            name: localDraft.fileName,
            label: localDraft.suggestedLabel,
            executor: localDraft.executor,
            content: (localDraft as any).content || "",
            sourceOrigin: localDraft.fullPath,
          });
        }
      }
    }
  }

  const handlePublish = async () => {
    if (!pipelineName.trim()) {
      toast.error("Please enter a pipeline name.");
      return;
    }

    // Convert nodes to SavePipelineNodeItem
    const saveNodes = nodes
      .filter((n) => n.type !== "scopeContainer")
      .map((n) => {
        const d = n.data || {};
        return {
          id: n.id,
          refId: (d.refId as string) || n.id,
          kind: 1, // Custom
          positionX: n.position.x,
          positionY: n.position.y,
          configValues: (d.configValues as Record<string, any>) || {},
          parentId: n.parentId as any,
          metadata: (d.metadata as Record<string, any>) || undefined,
        };
      });

    const saveEdges = edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.source,
      sourcePin: e.sourceHandle || "out",
      targetNodeId: e.target,
      targetPin: e.targetHandle || "in",
    }));

    try {
      const result = await publishMutation.mutateAsync({
        projectId,
        pipelineId,
        name: pipelineName.trim(),
        description: description.trim() || undefined,
        nodes: saveNodes as any,
        edges: saveEdges as any,
        parameters: parameters || [],
        localScripts: usedLocalScripts,
      });

      toast.success(result.message || "Pipeline published to Studio successfully!");
      onPublished?.(result.pipelineId);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to publish pipeline.");
    }
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open: boolean) => !open && onClose()} className="sm:max-w-lg">
      <DialogHeader className="mb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">Publish Pipeline to Studio</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Bundle your local scripts and snapshot the pipeline into Studio Cloud.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Pipeline Name</label>
          <Input
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            placeholder="e.g. Genesis 9 Production Bake"
            className="h-8.5 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Description / Release Notes (Optional)</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Initial version with Cycles modular bake"
            className="h-8.5 text-xs"
          />
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-primary" />
              Local Scripts Included
            </span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {usedLocalScripts.length} scripts
            </Badge>
          </div>

          {usedLocalScripts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              No local scripts in this pipeline. Pure built-in tools will be snapshotted directly.
            </p>
          ) : (
            <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
              {usedLocalScripts.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between text-[11px] bg-background/80 px-2 py-1.5 rounded border border-border/40"
                >
                  <span className="font-mono truncate">{s.key}</span>
                  <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                    {s.executor || "python"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="mt-5 flex items-center justify-between gap-2 border-t border-border/50 pt-4">
        <Button variant="ghost" size="sm" onPress={onClose} isDisabled={publishMutation.isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onPress={handlePublish}
          isDisabled={publishMutation.isPending}
          className="gap-1.5"
        >
          {publishMutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Publishing...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Publish to Studio</span>
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
