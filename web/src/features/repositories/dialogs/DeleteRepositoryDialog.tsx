import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import { useDeleteRepository } from "../hooks/useRepositories";
import type { DialogProps } from "@/lib/dialog-registry";
import { toast } from "sonner";

export interface DeleteRepositoryDialogData {
  id: string;
  name: string;
  projectId?: string;
}

export function DeleteRepositoryDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<DeleteRepositoryDialogData>) {
  const deleteRepository = useDeleteRepository(data?.projectId);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Repository"
      description={`Are you sure you want to delete repository "${data?.name || ""}"? All associated resource links will be removed.`}
      confirmText="Delete"
      variant="destructive"
      isLoading={deleteRepository.isPending}
      onConfirm={() => {
        if (!data?.id) return;
        deleteRepository.mutate(
          { id: data.id },
          {
            onSuccess: () => {
              toast.success(`Repository "${data.name}" deleted`);
              onOpenChange(false);
            },
          }
        );
      }}
    />
  );
}
