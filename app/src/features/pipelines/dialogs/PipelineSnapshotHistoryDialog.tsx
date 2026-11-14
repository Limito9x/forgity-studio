import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  History,
  GitCommit,
  RotateCcw,
  Plus,
  Loader2,
  CheckCircle2,
  Calendar,
  User,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  usePipelineSnapshots,
  useCreatePipelineSnapshot,
  useRollbackPipelineSnapshot,
  type PipelineSnapshotSummaryDto,
} from "../hooks/usePipelineGraph";
import { cn } from "@/lib/utils";

interface PipelineSnapshotHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  pipelineName?: string;
  onRollbackSuccess?: () => void;
}

export function PipelineSnapshotHistoryDialog({
  open,
  onOpenChange,
  pipelineId,
  pipelineName,
  onRollbackSuccess,
}: PipelineSnapshotHistoryDialogProps) {
  const { data: snapshots, isLoading, refetch } = usePipelineSnapshots(pipelineId);
  const createMutation = useCreatePipelineSnapshot(pipelineId);
  const rollbackMutation = useRollbackPipelineSnapshot(pipelineId);

  const [checkpointSummary, setCheckpointSummary] = useState("");
  const [rollbackTarget, setRollbackTarget] = useState<PipelineSnapshotSummaryDto | null>(null);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointSummary.trim()) {
      toast.error("Please enter a checkpoint summary or note.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        summary: checkpointSummary.trim(),
      });
      setCheckpointSummary("");
      toast.success("Pipeline checkpoint created successfully.");
      void refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create pipeline checkpoint.");
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;

    try {
      await rollbackMutation.mutateAsync(rollbackTarget.id);
      toast.success(`Rolled back to Version v${rollbackTarget.versionNumber} successfully.`);
      setRollbackTarget(null);
      void refetch();
      onRollbackSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to rollback to selected snapshot.");
    }
  };

  const getSourceBadgeVariant = (source: string) => {
    switch (source.toLowerCase()) {
      case "manual":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "run":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "import":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "systemmigration":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <>
      <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-2xl max-h-[85vh]">
        <div className="flex flex-col h-full space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <History className="h-4 w-4 text-primary" />
              <span>Version History & Checkpoints</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Review immutable snapshots, create manual checkpoints, or rollback to a prior graph state for{" "}
              <strong className="text-foreground font-medium">{pipelineName || "this pipeline"}</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Quick Create Checkpoint Box */}
          <form
            onSubmit={handleCreateSnapshot}
            className="flex items-center gap-2 p-3 rounded-lg border border-border/70 bg-muted/30"
          >
            <Input
              value={checkpointSummary}
              onChange={(e) => setCheckpointSummary(e.target.value)}
              placeholder="Checkpoint note (e.g., 'Before modifying rigging nodes')..."
              className="h-8 text-xs flex-1"
              disabled={createMutation.isPending}
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs gap-1.5 shrink-0"
              isDisabled={createMutation.isPending || !checkpointSummary.trim()}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span>Create Checkpoint</span>
            </Button>
          </form>

          {/* Snapshots List */}
          <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[420px] pr-1 space-y-2.5">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Loading snapshot history...</span>
              </div>
            ) : !snapshots || snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs gap-2 border border-dashed rounded-lg">
                <GitCommit className="h-8 w-8 text-muted-foreground/40" />
                <span>No snapshots recorded yet. Create a checkpoint to get started.</span>
              </div>
            ) : (
              snapshots.map((item: PipelineSnapshotSummaryDto) => {
                const createdDate = new Date(item.createdAt);
                const isItemActive = item.isActive;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start justify-between p-3 rounded-lg border transition-colors text-xs",
                      isItemActive
                        ? "border-primary/50 bg-primary/5 shadow-xs"
                        : "border-border/60 bg-card hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-0.5 shrink-0">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center w-7 h-7 rounded-md font-mono font-bold text-[11px]",
                            isItemActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground border border-border"
                          )}
                        >
                          v{item.versionNumber}
                        </span>
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "font-medium truncate",
                              isItemActive ? "text-foreground font-semibold" : "text-foreground/90"
                            )}
                          >
                            {item.summary || `Snapshot Version ${item.versionNumber}`}
                          </span>

                          {isItemActive && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1.5 py-0 text-[10px] bg-primary/10 text-primary border-primary/30 font-medium"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                              Active
                            </Badge>
                          )}

                          <Badge
                            variant="outline"
                            className={cn("h-4 px-1.5 py-0 text-[10px] font-mono", getSourceBadgeVariant(item.source))}
                          >
                            {item.source}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1 font-mono">
                            <span className="text-[10px] text-muted-foreground/60">SHA:</span>
                            {item.graphHash.substring(0, 7)}
                          </span>

                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 opacity-60" />
                            <span title={format(createdDate, "yyyy-MM-dd HH:mm:ss")}>
                              {formatDistanceToNow(createdDate, { addSuffix: true })}
                            </span>
                          </span>

                          {item.createdBy && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3 opacity-60" />
                              <span>{item.createdBy}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 pl-3 self-center">
                      {isItemActive ? (
                        <span className="text-[11px] text-primary/80 font-medium px-2 py-1">
                          Current
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 hover:border-primary/50 hover:text-primary"
                          onPress={() => setRollbackTarget(item)}
                          isDisabled={rollbackMutation.isPending}
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Rollback</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between border-t border-border/50 pt-3">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Snapshots are immutable. Rollback creates a new active version safely.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onPress={() => onOpenChange(false)}
              className="h-8 text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* Rollback Confirmation Dialog */}
      {rollbackTarget && (
        <Dialog
          isOpen={!!rollbackTarget}
          onOpenChange={(isOpen) => !isOpen && setRollbackTarget(null)}
          className="sm:max-w-md"
        >
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-amber-500">
                <AlertCircle className="h-4 w-4" />
                <span>Confirm Version Rollback</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
                Are you sure you want to rollback to{" "}
                <strong className="text-foreground font-medium">
                  Version v{rollbackTarget.versionNumber} ({rollbackTarget.summary || rollbackTarget.source})
                </strong>
                ?
                <br />
                Your current canvas graph will be replaced with this snapshot's state. A new snapshot will be registered to preserve your history.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onPress={() => setRollbackTarget(null)}
                isDisabled={rollbackMutation.isPending}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onPress={handleRollback}
                isDisabled={rollbackMutation.isPending}
                className="h-8 text-xs gap-1.5"
              >
                {rollbackMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                <span>Confirm Rollback</span>
              </Button>
            </DialogFooter>
          </div>
        </Dialog>
      )}
    </>
  );
}

