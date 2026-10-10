import { CreateProjectForm } from "../components/CreateProjectForm";
import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useCreateProject } from "../hooks/useProjects";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

export function CreateProjectDialog({ open, onOpenChange }: DialogProps<undefined>) {
    const { t } = useTranslation("projects");
    const { studioId: activeStudioId } = useCurrentStudio();
    const createProject = useCreateProject();
    const isPending = createProject.isPending;

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.create", { defaultValue: "Create Project" })}
            formId="create-project-form"
            isPending={isPending}
            size="md"
        >
            <CreateProjectForm
                onSubmit={(values) => {
                    createProject.mutate({
                        data: {
                            ...values,
                            studioId: activeStudioId || undefined,
                        },
                    }, {
                        onSuccess: () => onOpenChange(false)
                    });
                }}
            />
        </BaseFormDialog>
    );
}
