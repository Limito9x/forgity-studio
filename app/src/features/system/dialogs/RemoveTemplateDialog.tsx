import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { customInstance } from "@/lib/api-client";

export interface RemoveTemplateDialogData {
  templateId: string;
  title: string;
  onSuccess?: () => void | Promise<void>;
}

export function RemoveTemplateDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<RemoveTemplateDialogData>) {
  const [isRemoving, setIsRemoving] = useState(false);

  const handleConfirm = async () => {
    if (!data?.templateId) return;
    setIsRemoving(true);
    try {
      const res = await customInstance<{
        deleted: boolean;
        archived: boolean;
        message: string;
      }>({
        url: `/api/templates/containers/${data.templateId}`,
        method: "DELETE",
      });
      toast.success(res?.message || "Template removed.");
      await data.onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.title || err?.message || "Failed to remove template."
      );
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remove Template"
      description={
        data?.title
          ? `Remove template "${data.title}"? If no users have forked it, it will be permanently deleted. Otherwise, it will be unpublished and archived from the catalog.`
          : "Remove this template? If no users have forked it, it will be permanently deleted. Otherwise, it will be unpublished and archived from the catalog."
      }
      confirmText="Remove"
      cancelText="Cancel"
      variant="destructive"
      isLoading={isRemoving}
      onConfirm={handleConfirm}
    />
  );
}
