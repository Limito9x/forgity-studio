import { CreateProjectForm, type CreateProjectFormSubmitData } from "../components/CreateProjectForm";
import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useCreateProject } from "../hooks/useProjects";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { useImportProjectPackage } from "../hooks/useProjectMigrations";
import { toast } from "sonner";

export function CreateProjectDialog({ open, onOpenChange }: DialogProps<undefined>) {
    const { t } = useTranslation("projects");
    const { studioId: activeStudioId } = useCurrentStudio();
    const createProject = useCreateProject();
    const importPackage = useImportProjectPackage();
    const isPending = createProject.isPending || importPackage.isPending;

    const handleFormSubmit = async (values: CreateProjectFormSubmitData) => {
        const { starterTemplate, ...projectData } = values;

        createProject.mutate({
            data: {
                ...projectData,
                studioId: activeStudioId || undefined,
                storageProfileId: projectData.storageProfileId || undefined,
            },
        }, {
            onSuccess: async (createdProject) => {
                if (starterTemplate === "genesis9" && createdProject?.id) {
                    try {
                        toast.info("Importing Genesis 9 Starter Template...", { duration: 3000 });
                        const templateRes = await fetch("/templates/genesis9-unreal-modular-starter.forgity.pkg");
                        if (templateRes.ok) {
                            const blob = await templateRes.blob();
                            const templateFile = new File([blob], "genesis9-unreal-modular-starter.forgity.pkg", {
                                type: "application/zip",
                            });

                            await importPackage.mutateAsync({
                                id: createdProject.id,
                                data: {
                                    file: templateFile,
                                    strategy: 0 as any, // Overwrite
                                },
                            });
                            toast.success("Starter template configured successfully!");
                        }
                    } catch (importErr) {
                        console.error("Failed to apply starter template:", importErr);
                        toast.warning("Project created, but starter template could not be auto-applied.");
                    }
                }
                onOpenChange(false);
            }
        });
    };

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.create", { defaultValue: "Create Project" })}
            formId="create-project-form"
            isPending={isPending}
            size="md"
        >
            <CreateProjectForm onSubmit={handleFormSubmit} />
        </BaseFormDialog>
    );
}
