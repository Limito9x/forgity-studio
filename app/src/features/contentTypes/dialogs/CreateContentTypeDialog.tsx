import { CreateContentTypeForm } from "../components/CreateContentTypeForm";
import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useCreateContentType } from "../hooks/useContentTypes";

export function CreateContentTypeDialog({ open, onOpenChange, data }: DialogProps<{ projectId: string }>) {
    const { t } = useTranslation("contentTypes");
    const projectId = data?.projectId ?? "";
    const createContentType = useCreateContentType({ projectId });

    if (!projectId) return null;

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.create", { defaultValue: "Add ContentType" })}
            formId="create-content-type-form"
            isPending={createContentType.isPending}
            size="md"
        >
            <CreateContentTypeForm
                projectId={projectId}
                onSubmit={(values) => {
                    createContentType.mutate(
                        { projectId, data: values },
                        {
                            onSuccess: () => onOpenChange(false)
                        }
                    );
                }}
            />
        </BaseFormDialog>
    );
}
