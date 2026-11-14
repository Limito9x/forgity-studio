import { toast } from "sonner";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useDeleteContentItem } from "../hooks/useContentItems";

export function DeleteContentItemDialog({ open, onOpenChange, data }: DialogProps<{ id: string; typeKey: string; projectId: string }>) {
    const { t } = useTranslation("contentItems");
    const deleteContentItem = useDeleteContentItem({ projectId: data?.projectId, contentTypeKey: data?.typeKey });

    const handleDelete = () => {
        if (!data?.id) return;
        deleteContentItem.mutate(
            {
                projectId: data.projectId,
                contentTypeKey: data.typeKey,
                keyOrId: data.id,
                data: {},
            },
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
            title={t("actions.delete", { defaultValue: "Delete ContentItem" }) + (data?.typeKey ? ` (${data.typeKey})` : "")}
            description={t("actions.deleteConfirm", { defaultValue: "Are you sure you want to delete this contentItem? This action cannot be undone." })}
            confirmText={t("actions.delete", { defaultValue: "Delete" })}
            cancelText={t("cancel", { ns: "common", defaultValue: "Cancel" })}
            variant="destructive"
            isLoading={deleteContentItem.isPending}
            onConfirm={handleDelete}
        />
    );
}
