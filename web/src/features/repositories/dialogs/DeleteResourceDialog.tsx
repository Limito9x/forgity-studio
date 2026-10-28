import { useState } from "react";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import { useDeleteResource } from "../hooks/useRepositories";
import type { DialogProps } from "@/lib/dialog-registry";
import { toast } from "sonner";

export interface DeleteResourceDialogData {
  id?: string;
  name?: string;
  ids?: string[];
  repositoryId?: string;
  onSuccess?: () => void;
}

export function DeleteResourceDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<DeleteResourceDialogData>) {
  const deleteMutation = useDeleteResource(data?.repositoryId);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const isBatch = Boolean(data?.ids && data.ids.length > 1);
  const count = data?.ids?.length || 1;

  const title = isBatch ? "Delete Resources" : "Delete Resource";
  const description = isBatch
    ? `Are you sure you want to remove ${count} selected resources from the repository? This action cannot be undone.`
    : `Are you sure you want to remove "${data?.name || "this resource"}" from the repository? This action cannot be undone.`;
  const confirmText = isBatch ? `Delete (${count})` : "Delete";

  const handleConfirm = async () => {
    if (isBatch && data?.ids) {
      setIsBatchDeleting(true);
      const toastId = toast.loading(`Removing ${data.ids.length} resources...`);
      try {
        for (const id of data.ids) {
          await deleteMutation.mutateAsync({ id });
        }
        toast.success(`Removed ${data.ids.length} resources successfully.`, { id: toastId });
        data.onSuccess?.();
        onOpenChange(false);
      } catch (err: any) {
        toast.error(err?.message || "Failed to remove some resources.", { id: toastId });
      } finally {
        setIsBatchDeleting(false);
      }
      return;
    }

    const singleId = data?.id || data?.ids?.[0];
    if (!singleId) return;

    deleteMutation.mutate(
      { id: singleId },
      {
        onSuccess: () => {
          toast.success(`Removed "${data?.name || "resource"}" from repository.`);
          data?.onSuccess?.();
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to remove resource.");
        },
      }
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmText={confirmText}
      variant="destructive"
      isLoading={deleteMutation.isPending || isBatchDeleting}
      onConfirm={handleConfirm}
    />
  );
}

