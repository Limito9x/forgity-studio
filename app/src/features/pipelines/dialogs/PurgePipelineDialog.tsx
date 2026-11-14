import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import type { PipelineSummaryDto } from "@/gen/model";
import { usePurgePipelineMutation } from "../hooks/usePipelines";

export function PurgePipelineDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<{ pipeline: PipelineSummaryDto }>) {
  const pipeline = data?.pipeline;
  const purgeMutation = usePurgePipelineMutation(pipeline?.projectId);

  const handlePurge = async () => {
    if (!pipeline?.id) return;
    try {
      await purgeMutation.mutateAsync(pipeline.id);
      onOpenChange(false);
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Permanently Delete Pipeline"
      description={
        pipeline?.name
          ? `Are you sure you want to permanently delete pipeline "${pipeline.name}"? This action cannot be undone. All nodes, edges, asset links, and execution history will be irreversibly erased from the database.`
          : "Are you sure you want to permanently delete this pipeline? This action cannot be undone."
      }
      confirmText="Delete Permanently"
      cancelText="Cancel"
      variant="destructive"
      isLoading={purgeMutation.isPending}
      onConfirm={handlePurge}
    />
  );
}
