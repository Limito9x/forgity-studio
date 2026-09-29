import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  FileCode,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Cpu,
  Box,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useAnalyzeCustomNodesBatchMutation,
  useBatchUpsertCustomNodesMutation,
} from "../hooks/usePipelines";
import type {
  AnalyzedCustomNodeDto,
  BatchUpsertItem,
} from "@/gen/model";

interface BatchUploadScriptsDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function BatchUploadScriptsDialog({
  projectId,
  isOpen,
  onClose,
}: BatchUploadScriptsDialogProps) {
  const [analyzedNodes, setAnalyzedNodes] = useState<AnalyzedCustomNodeDto[]>([]);
  const [nodeStrategies, setNodeStrategies] = useState<Record<string, number>>({});

  const analyzeMutation = useAnalyzeCustomNodesBatchMutation();
  const batchUpsertMutation = useBatchUpsertCustomNodesMutation(projectId);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const pythonFiles = acceptedFiles.filter((f) => f.name.endsWith(".py"));
      if (pythonFiles.length === 0) {
        toast.error("Please select valid Python (.py) script files.");
        return;
      }

      try {
        const readFiles = await Promise.all(
          pythonFiles.map(async (file) => ({
            fileName: file.name,
            scriptContent: await file.text(),
          }))
        );

        const result = await analyzeMutation.mutateAsync({
          projectId,
          scripts: readFiles,
        });

        if (result?.nodes) {
          setAnalyzedNodes(result.nodes);
          const initialStrategies: Record<string, number> = {};
          result.nodes.forEach((n) => {
            initialStrategies[n.key] = 0; // 0 = KeepCompatiblePins (default)
          });
          setNodeStrategies(initialStrategies);
        }
      } catch (err: any) {
        const errorMsg =
          err?.response?.data?.message || err?.message || "Failed to analyze scripts";
        toast.error(errorMsg);
      }
    },
    [projectId, analyzeMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/x-python": [".py"] },
    multiple: true,
  });

  const handleReset = () => {
    setAnalyzedNodes([]);
    setNodeStrategies({});
  };

  const handlePublishAll = async () => {
    if (analyzedNodes.length === 0) return;

    const items: BatchUpsertItem[] = analyzedNodes.map((n) => ({
      key: n.key,
      name: n.suggestedName,
      label: n.suggestedLabel ?? null,
      executor: n.executor ?? null,
      contentHash: n.contentHash ?? null,
      originalFileName: n.fileName ?? null,
      assetId: null,
      inputs: (n.inputs ?? []) as any,
      outputs: (n.outputs ?? []) as any,
      strategy: (nodeStrategies[n.key] ?? 0) as any,
    }));

    try {
      await batchUpsertMutation.mutateAsync({
        projectId,
        items,
      });
      handleReset();
      onClose();
    } catch {
      // Error handled by mutation hook toast
    }
  };

  const getExecutorIcon = (executor: string) => {
    switch (executor?.toLowerCase()) {
      case "blender":
        return <Box className="size-3.5 text-orange-500" />;
      case "unreal":
        return <Sparkles className="size-3.5 text-blue-500" />;
      default:
        return <Cpu className="size-3.5 text-emerald-500" />;
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleReset();
          onClose();
        }
      }}
      className="sm:max-w-3xl lg:max-w-4xl"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <UploadCloud className="size-5 text-primary" />
          Batch Upload Custom Scripts
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          Drag & drop multiple Python scripts. The system automatically inspects pins,
          detects updates, and protects existing pipeline connections.
        </p>
      </DialogHeader>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Dropzone */}
        {analyzedNodes.length === 0 && (
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-150",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              <div className="p-3.5 rounded-full bg-primary/10 text-primary">
                {analyzeMutation.isPending ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <UploadCloud className="size-6" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {analyzeMutation.isPending
                    ? "Parsing and analyzing scripts..."
                    : "Drag & drop Python (.py) scripts here"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  or click to browse from your computer (supports multiple files)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Analyzed List */}
        {analyzedNodes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                Found <strong>{analyzedNodes.length}</strong> script(s) ready for review:
              </span>
              <Button
                variant="ghost"
                size="sm"
                onPress={handleReset}
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Reset & Upload Different Files
              </Button>
            </div>

            <div className="grid gap-3">
              {analyzedNodes.map((item) => {
                const hasImpact = (item.impactReport?.affectedPipelineCount ?? 0) > 0;
                const hasInputDiff = (item.inputPinDiffs?.length ?? 0) > 0;
                const hasOutputDiff = (item.outputPinDiffs?.length ?? 0) > 0;

                return (
                  <div
                    key={item.key}
                    className={cn(
                      "rounded-lg border p-4 space-y-3 transition-all",
                      item.isOverride
                        ? "border-amber-500/30 bg-amber-500/[0.02]"
                        : "border-border bg-card"
                    )}
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileCode className="size-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">{item.fileName}</span>
                        <Badge
                          variant="secondary"
                          className="gap-1 font-mono text-[10px] uppercase"
                        >
                          {getExecutorIcon(item.executor)}
                          {item.executor}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.isOverride ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1 text-[11px]"
                          >
                            <RotateCcw className="size-3" />
                            Override Existing Node
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 text-[11px]"
                          >
                            <CheckCircle2 className="size-3" />
                            New Node
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          {item.inputs.length} in / {item.outputs.length} out
                        </span>
                      </div>
                    </div>

                    {/* Impact Warning */}
                    {hasImpact && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                        <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-medium">
                            Connection Impact Warning:
                          </p>
                          <p>
                            Used in{" "}
                            <strong>
                              {item.impactReport.affectedPipelineCount} pipeline(s)
                            </strong>{" "}
                            across {item.impactReport.affectedNodeCount} node instance(s).
                            {item.impactReport.affectedEdgeCount > 0 && (
                              <span className="text-destructive font-semibold">
                                {" "}
                                {item.impactReport.affectedEdgeCount} connection wire(s) will be
                                detached!
                              </span>
                            )}
                          </p>
                          {item.impactReport.affectedPipelineNames?.length > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              Pipelines: {item.impactReport.affectedPipelineNames.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pin Diffs for Overrides */}
                    {(hasInputDiff || hasOutputDiff) && (
                      <div className="space-y-1.5 border-t pt-2.5">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Detected Pin Changes (Diff):
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.inputPinDiffs?.map((diff, i) => (
                            <Badge
                              key={`in-${i}`}
                              variant="outline"
                              className={cn(
                                "text-[10px] font-mono",
                                diff.diffKind === "Added" &&
                                "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                diff.diffKind === "Removed" &&
                                "border-destructive/40 bg-destructive/10 text-destructive",
                                diff.diffKind === "TypeChanged" &&
                                "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              )}
                            >
                              [Input] {diff.diffKind === "Added" ? "+" : diff.diffKind === "Removed" ? "-" : "~"} {diff.label} ({diff.primitiveType})
                            </Badge>
                          ))}
                          {item.outputPinDiffs?.map((diff, i) => (
                            <Badge
                              key={`out-${i}`}
                              variant="outline"
                              className={cn(
                                "text-[10px] font-mono",
                                diff.diffKind === "Added" &&
                                "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                diff.diffKind === "Removed" &&
                                "border-destructive/40 bg-destructive/10 text-destructive",
                                diff.diffKind === "TypeChanged" &&
                                "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              )}
                            >
                              [Output] {diff.diffKind === "Added" ? "+" : diff.diffKind === "Removed" ? "-" : "~"} {diff.label} ({diff.primitiveType})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Edge Reconciliation Strategy Selector for Overrides */}
                    {item.isOverride && (
                      <div className="flex items-center justify-between border-t pt-2.5 text-xs">
                        <span className="text-muted-foreground">
                          Reconciliation Strategy:
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant={nodeStrategies[item.key] === 0 ? "secondary" : "ghost"}
                            size="sm"
                            className={cn(
                              "h-7 text-xs",
                              nodeStrategies[item.key] === 0 && "font-semibold shadow-xs"
                            )}
                            onPress={() =>
                              setNodeStrategies((prev) => ({ ...prev, [item.key]: 0 }))
                            }
                          >
                            Keep Compatible Pins
                          </Button>
                          <Button
                            variant={nodeStrategies[item.key] === 1 ? "secondary" : "ghost"}
                            size="sm"
                            className={cn(
                              "h-7 text-xs text-destructive hover:text-destructive",
                              nodeStrategies[item.key] === 1 && "font-semibold shadow-xs"
                            )}
                            onPress={() =>
                              setNodeStrategies((prev) => ({ ...prev, [item.key]: 1 }))
                            }
                          >
                            Unpin All Wires
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onPress={() => {
            handleReset();
            onClose();
          }}
          isDisabled={batchUpsertMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onPress={handlePublishAll}
          isDisabled={analyzedNodes.length === 0 || batchUpsertMutation.isPending}
          className="gap-2"
        >
          {batchUpsertMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving Nodes...
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Publish All ({analyzedNodes.length})
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
