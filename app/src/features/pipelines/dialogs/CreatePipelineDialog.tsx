import { useState } from "react";
import { Workflow } from "lucide-react";
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
import { useCreatePipelineMutation } from "../hooks/usePipelines";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

export function CreatePipelineDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<{ projectId: string }>) {
  const projectId = data?.projectId || "";
  const nav = useProjectNav({ projectId });
  const createMutation = useCreatePipelineMutation(projectId);
  const [pipelineName, setPipelineName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineName.trim() || !projectId) return;

    try {
      const created = await createMutation.mutateAsync({
        projectId,
        name: pipelineName.trim(),
      } as any);

      onOpenChange(false);
      setPipelineName("");

      if (created?.id) {
        nav.toPipeline(created.id);
      }
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleCreate} className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Workflow className="h-4 w-4 text-primary" />
            <span>Create New Pipeline</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter a unique name for your pipeline to open the visual DAG editor.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="create-pname" className="text-xs font-semibold">
              Pipeline Name
            </Label>
            <Input
              id="create-pname"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              placeholder="e.g. Ingest FBX & Auto Inspect"
              autoFocus
              required
              className="h-9 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() => onOpenChange(false)}
            isDisabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            isDisabled={!pipelineName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create & Open Canvas"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
