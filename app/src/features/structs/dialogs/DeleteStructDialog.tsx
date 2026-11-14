import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useDeleteStruct } from "../hooks/useStructs";
import { toast } from "sonner";

export function DeleteStructDialog({
    open,
    onOpenChange,
    data
}: DialogProps<{ projectId: string; structId: string; structName?: string }>) {
    const { t } = useTranslation("structs");
    const projectId = data?.projectId ?? "";
    const structId = data?.structId ?? "";
    const structName = data?.structName || "this struct";

    const deleteStruct = useDeleteStruct({ projectId });

    if (!projectId || !structId) return null;

    const handleConfirm = () => {
        deleteStruct.mutate(
            { projectId, id: structId },
            {
                onSuccess: () => {
                    toast.success(t("messages.deleteSuccess", { defaultValue: `Struct '${structName}' deleted successfully` }));
                    onOpenChange(false);
                },
                onError: (error: any) => {
                    const message = error?.message || error?.response?.data?.message || "Failed to delete struct";
                    toast.error(message, {
                        duration: 6000,
                    });
                }
            }
        );
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.delete", { defaultValue: `Delete Struct '${structName}'` })}
            description={t("dialogs.deleteDescription", {
                defaultValue: `Are you sure you want to delete '${structName}'? This action cannot be undone. If other schemas or content types depend on this struct, deletion will be blocked.`
            })}
            confirmText={t("common:delete", { defaultValue: "Delete" })}
            cancelText={t("common:cancel", { defaultValue: "Cancel" })}
            variant="destructive"
            isLoading={deleteStruct.isPending}
            onConfirm={handleConfirm}
        />
    );
}
