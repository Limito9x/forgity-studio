import { FormPageShell } from "@/components/layout/shells/FormPageShell";
import { ContentItemForm, type ContentItemFormValues } from "./components/ContentItemForm";
import { useCreateContentItem } from "./hooks/useContentItems";
import { useLoaderData, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ContentTypeDto } from "@/gen/model";

export function CreateContentItemPage() {
    const { t } = useTranslation("contentItems");
    const navigate = useNavigate();

    const parentData = useLoaderData({
        from: "/_protected/_project/projects/$projectId/contents/$typeKey",
    }) as { contentType: ContentTypeDto } | undefined;
    const contentType = parentData?.contentType;

    const { projectId, typeKey } = useParams({
        from: "/_protected/_project/projects/$projectId/contents/$typeKey",
    });

    const createContentItem = useCreateContentItem({ projectId, contentTypeKey: typeKey });

    const handleSubmit = (data: ContentItemFormValues) => {
        if (!projectId || !typeKey) return;

        const { name, key, thumbnailAssetId, ...values } = data;
        const itemName = name || "Untitled";

        createContentItem.mutate(
            {
                data: {
                    name: itemName,
                    itemKey: key || undefined,
                    values: values as any,
                    thumbnailAssetId: thumbnailAssetId ?? undefined,
                },
                projectId,
                key: typeKey
            },
            {
                onSuccess: () => {
                    toast.success(t("messages.createSuccess", { defaultValue: "Content Item created successfully" }));
                    navigate({
                        to: "/projects/$projectId/contents/$typeKey",
                        params: { projectId, typeKey },
                    });
                },
                onError: (error: any) => {
                    toast.error(error?.message || t("messages.createError", { defaultValue: "Failed to create content item" }));
                },
            }
        );
    };

    const formId = `create-content-item-form-${typeKey}`;

    if (!contentType) {
        return null;
    }

    return (
        <FormPageShell
            title={t("actions.createTitle", { defaultValue: `Create ${contentType.displayName || 'Content Item'}` })}
            description={t("actions.createDescription", { defaultValue: `Fill in the details to create a new ${contentType.displayName || 'content item'}.` })}
            formId={formId}
            isPending={createContentItem.isPending}
            onCancel={() =>
                navigate({
                    to: "/projects/$projectId/contents/$typeKey",
                    params: { projectId, typeKey },
                })
            }
        >
            <ContentItemForm
                formId={formId}
                contentType={contentType}
                onSubmit={handleSubmit}
            />
        </FormPageShell>
    );
}
