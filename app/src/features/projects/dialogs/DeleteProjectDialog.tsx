import { toast } from "sonner";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useDeleteProject } from "../hooks/useProjects";

export function DeleteProjectDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation("projects");
    const deleteProject = useDeleteProject();

    const handleDelete = () => {
        if (!data?.id) return;
        deleteProject.mutate(
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
            title={t("actions.delete", { defaultValue: "Delete Project" })}
            description={t("actions.deleteConfirm", { defaultValue: "Are you sure you want to delete this project? This action cannot be undone." })}
            confirmText={t("actions.delete", { defaultValue: "Delete" })}
            cancelText={t("cancel", { ns: "common", defaultValue: "Cancel" })}
            variant="destructive"
            isLoading={deleteProject.isPending}
            onConfirm={handleDelete}
        />
    );
}
