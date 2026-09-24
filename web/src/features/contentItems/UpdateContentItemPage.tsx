import { useState, useMemo } from "react";
import { FormPageShell } from "@/components/layout/shells/FormPageShell";
import { ContentItemForm, type ContentItemFormValues } from "./components/ContentItemForm";
import { ContentResourcesTab } from "./components/ContentResourcesTab";
import { useGetContentItemById, useUpdateContentItem } from "./hooks/useContentItems";
import { useGetResourcesByContent } from "@/gen/endpoints/resources/resources";
import { useLoaderData, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ContentTypeDto } from "@/gen/model";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function UpdateContentItemPage() {
    const { t } = useTranslation("contentItems");
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<"details" | "resources">("details");

    const parentData = useLoaderData({
        from: "/_protected/_project/projects/$projectId/contents/$typeKey",
    }) as { contentType: ContentTypeDto } | undefined;
    const contentType = parentData?.contentType;

    const { projectId, typeKey, contentItemId } = useParams({
        from: "/_protected/_project/projects/$projectId/contents/$typeKey/$contentItemId/edit",
    });

    const { data: itemData, isLoading, error } = useGetContentItemById(contentItemId);
    const { data: linkedResources } = useGetResourcesByContent(contentItemId);

    const updateContentItem = useUpdateContentItem({ projectId: projectId, contentTypeKey: typeKey });

    const initialFormValues = useMemo(() => {
        if (!itemData) return undefined;
        return {
            name: itemData.name || "",
            thumbnailAssetId: itemData.thumbnailAssetId ?? undefined,
            thumbnailUrl: itemData.thumbnailUrl ?? undefined,
            resolvedData: (itemData as any).resolvedData,
            ...((itemData.values as Record<string, any>) || {}),
        };
    }, [itemData]);

    const handleSubmit = (data: ContentItemFormValues) => {
        if (!projectId || !typeKey || !contentItemId) return;

        const { name, thumbnailAssetId, ...values } = data;
        const itemName = name || "Untitled";

        updateContentItem.mutate(
            {
                id: contentItemId,
                data: {
                    name: itemName,
                    values: values as any,
                    thumbnailAssetId: thumbnailAssetId ?? undefined,
                },
            },
            {
                onSuccess: () => {
                    toast.success(t("messages.updateSuccess", { defaultValue: "Content Item updated successfully" }));
                    navigate({
                        to: "/projects/$projectId/contents/$typeKey",
                        params: { projectId, typeKey },
                    });
                },
                onError: (error: any) => {
                    toast.error(error?.message || t("messages.updateError", { defaultValue: "Failed to update content item" }));
                },
            }
        );
    };

    const handleCancel = () => {
        if (projectId && typeKey) {
            navigate({
                to: "/projects/$projectId/contents/$typeKey",
                params: { projectId, typeKey },
            });
        }
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-4 max-w-3xl mx-auto">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-64 w-full mt-6" />
            </div>
        );
    }

    if (error || !itemData || !contentType) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <p className="text-destructive font-semibold">Error loading content item</p>
                <button
                    onClick={handleCancel}
                    className="mt-4 text-sm text-primary underline hover:text-primary/80"
                >
                    Back to Content List
                </button>
            </div>
        );
    }

    return (
        <FormPageShell
            title={t("actions.editTitle", { defaultValue: `Edit ${contentType.displayName || 'Content Item'}` })}
            description={t("actions.editDescription", { defaultValue: `Update details for ${itemData.name || 'this item'}.` })}
            formId={activeTab === "details" ? "update-content-item-form" : undefined}
            isPending={updateContentItem.isPending}
            onCancel={handleCancel}
        >
            <div className="space-y-6">
                {/* Tab switcher */}
                <div className="flex items-center p-1 rounded-xl bg-muted/60 border w-fit">
                    <button
                        type="button"
                        onClick={() => setActiveTab("details")}
                        className={cn(
                            "inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                            activeTab === "details"
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <FileText className="size-3.5" />
                        <span>Item Details</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("resources")}
                        className={cn(
                            "inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                            activeTab === "resources"
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Layers className="size-3.5" />
                        <span>Workspace Resources</span>
                        {linkedResources && linkedResources.length > 0 && (
                            <span className={cn(
                                "px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold",
                                activeTab === "resources"
                                    ? "bg-primary-foreground/20 text-primary-foreground"
                                    : "bg-primary/10 text-primary"
                            )}>
                                {linkedResources.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab 1: Content Item Form */}
                {activeTab === "details" && (
                    <ContentItemForm
                        formId="update-content-item-form"
                        contentType={contentType}
                        initialData={initialFormValues}
                        onSubmit={handleSubmit}
                    />
                )}

                {/* Tab 2: Linked Workspace Resources */}
                {activeTab === "resources" && (
                    <div className="pt-2">
                        <ContentResourcesTab
                            contentId={contentItemId}
                            contentName={itemData.name}
                            projectId={projectId}
                        />
                    </div>
                )}
            </div>
        </FormPageShell>
    );
}
