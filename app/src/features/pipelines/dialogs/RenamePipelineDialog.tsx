import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import type { DialogProps } from "@/lib/dialog-registry";
import type { PipelineSummaryDto } from "@/gen/model";
import { useUpdatePipelineMutation } from "../hooks/usePipelines";

export function RenamePipelineDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<{ pipeline: PipelineSummaryDto }>) {
  const pipeline = data?.pipeline;
  const updateMutation = useUpdatePipelineMutation(pipeline?.projectId);
  const [renameValue, setRenameValue] = useState(pipeline?.name || "");

  useEffect(() => {
    if (pipeline?.name) {
      setRenameValue(pipeline.name);
    }
  }, [pipeline?.name]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipeline || !renameValue.trim()) return;

    try {
      await updateMutation.mutateAsync({
        id: pipeline.id,
        data: { name: renameValue.trim() },
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleRename} className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Pencil className="h-4 w-4 text-primary" />
            <span>Rename Pipeline</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Enter a new unique name for pipeline{" "}
            <strong className="text-foreground font-medium">"{pipeline?.name}"</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="rename-pipeline-name" className="text-xs font-medium">
            Pipeline Name
          </Label>
          <Input
            id="rename-pipeline-name"
            placeholder="e.g., Export FBX Production"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() => onOpenChange(false)}
            isDisabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            isDisabled={
              !renameValue.trim() ||
              renameValue.trim() === pipeline?.name ||
              updateMutation.isPending
            }
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
