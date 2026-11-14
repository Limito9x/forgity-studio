import { UpdateContentTypeForm } from "../components/UpdateContentTypeForm";
import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useUpdateContentType } from "../hooks/useContentTypes";
import type { ContentTypeDto } from "@/gen/model";

export function UpdateContentTypeDialog({ open, onOpenChange, data }: DialogProps<{ item: ContentTypeDto }>) {
    const { t } = useTranslation("contentTypes");
    const item = data?.item;
    const projectId = item?.projectId ?? "";
    const updateContentType = useUpdateContentType({ projectId });

    if (!item?.id) return null;

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.update", { defaultValue: "Edit ContentType" })}
            formId="update-content-type-form"
            isPending={updateContentType.isPending}
            size="md"
        >
            <UpdateContentTypeForm
                initialData={{
                    name: item.name,
                    displayName: item.displayName,
                    description: item.description,
                    icon: item.icon,
                    color: item.color,
                    sortOrder: item.sortOrder,
                    displayConfig: item.displayConfig,
                }}
                keyString={item.key}
                onSubmit={(values) => {
                    const itemId = item.id;
                    if (!itemId) return;
                    updateContentType.mutate(
                        { id: itemId, data: values },
                        {
                            onSuccess: () => onOpenChange(false)
                        }
                    );
                }}
            />
        </BaseFormDialog>
    );
}
