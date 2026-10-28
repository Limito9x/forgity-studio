import { toast } from "sonner";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import { useDeleteUser } from "../hooks/useUsers";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";

export function DeleteUserDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation(["users", "common"]);
    const deleteUser = useDeleteUser();

    const handleDelete = () => {
        if (!data?.id) return;
        deleteUser.mutate(
            { id: data.id },
            {
                onSuccess: () => {
                    toast.success(t("messages.deleteSuccess", { defaultValue: "User deleted successfully" }));
                    onOpenChange(false);
                },
                onError: (error: any) => {
                    toast.error(error?.message || t("common:error", { defaultValue: "An error occurred" }));
                }
            }
        );
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.deleteUser", { defaultValue: "Delete User" })}
            description={t("actions.deleteConfirm", { defaultValue: "Are you sure you want to delete this user? This action cannot be undone." })}
            confirmText={t("common:delete", { defaultValue: "Delete" })}
            cancelText={t("common:cancel", { defaultValue: "Cancel" })}
            variant="destructive"
            isLoading={deleteUser.isPending}
            onConfirm={handleDelete}
        />
    );
}
