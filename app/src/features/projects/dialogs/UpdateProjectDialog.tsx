import { UpdateProjectForm } from "../components/UpdateProjectForm";
import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useUpdateProject } from "../hooks/useProjects";

export function UpdateProjectDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation("projects");
    const updateProject = useUpdateProject();
    const isPending = updateProject.isPending;

    if (!data?.id) return null;

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.update", { defaultValue: "Edit Project" })}
            formId={`update-project-form-${data.id}`}
            isPending={isPending}
            size="md"
        >
            <UpdateProjectForm
                id={data.id}
                onSubmit={(values) => {
                    updateProject.mutate({ id: data.id, data: values }, {
                        onSuccess: () => onOpenChange(false)
                    });
                }}
            />
        </BaseFormDialog>
    );
}
