import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import type { PipelineSummaryDto } from "@/gen/model";
import { useDeletePipelineMutation } from "../hooks/usePipelines";

export function ArchivePipelineDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<{ pipeline: PipelineSummaryDto }>) {
  const pipeline = data?.pipeline;
  const archiveMutation = useDeletePipelineMutation(pipeline?.projectId);

  const handleArchive = async () => {
    if (!pipeline?.id) return;
    try {
      await archiveMutation.mutateAsync(pipeline.id);
      onOpenChange(false);
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Move Pipeline to Trash"
      description={
        pipeline?.name
          ? `Are you sure you want to move pipeline "${pipeline.name}" to Trash? All node setups, connections, asset links, and execution history will be safely preserved and can be restored at any time.`
          : "Are you sure you want to move this pipeline to Trash?"
      }
      confirmText="Move to Trash"
      cancelText="Cancel"
      variant="destructive"
      isLoading={archiveMutation.isPending}
      onConfirm={handleArchive}
    />
  );
}
