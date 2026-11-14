import { toast } from "sonner";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useDeleteRole } from "../hooks/useRoles";

export function DeleteRoleDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation("role");
    const deleteRole = useDeleteRole();

    const handleDelete = () => {
        if (!data?.id) return;
        deleteRole.mutate(
            { id: data.id },
            {
                onSuccess: () => {
                    toast.success(t("actions.deleteSuccess", { defaultValue: "Deleted successfully" }));
                    onOpenChange(false);
                },
                onError: (error: any) => {
                    toast.error(error.message || "Error");
                }
            }
        );
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.delete", { defaultValue: "Delete Role" })}
            description={t("actions.deleteConfirm", { defaultValue: "Are you sure you want to delete this role? This action cannot be undone." })}
            confirmText={t("actions.delete", { defaultValue: "Delete" })}
            cancelText={t("cancel", { ns: "common", defaultValue: "Cancel" })}
            variant="destructive"
            isLoading={deleteRole.isPending}
            onConfirm={handleDelete}
        />
    );
}
