import { toast } from "sonner";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useDeleteContentType } from "../hooks/useContentTypes";

export function DeleteContentTypeDialog({ open, onOpenChange, data }: DialogProps<{ id: string; projectId?: string }>) {
    const { t } = useTranslation("contentTypes");
    const projectId = data?.projectId ?? "";
    const deleteContentType = useDeleteContentType({ projectId });

    const handleDelete = () => {
        if (!data?.id) return;
        deleteContentType.mutate(
            { id: data.id },
            {
                onSuccess: () => {
                    toast.success(t("actions.deleteSuccess", { defaultValue: "Deleted successfully" }));
                    onOpenChange(false);
                }
            }
        );
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.delete", { defaultValue: "Delete ContentType" })}
            description={t("actions.deleteConfirm", { defaultValue: "Are you sure you want to delete this contentType? This action cannot be undone." })}
            confirmText={t("actions.delete", { defaultValue: "Delete" })}
            cancelText={t("cancel", { ns: "common", defaultValue: "Cancel" })}
            variant="destructive"
            isLoading={deleteContentType.isPending}
            onConfirm={handleDelete}
        />
    );
}
