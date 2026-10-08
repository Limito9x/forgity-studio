import { useState, useEffect } from "react";
import { ContentItemTable } from "./components/ContentItemTable";
import { useResourceQuery, type ResourcePageProps } from "@/lib/useResourceQuery";
import { ResourcePageShell } from "@/components/layout/shells/ResourcePageShell";
import { contentItemFilterConfig } from "./components/contentItemFilter";
import { useContentItems } from "./hooks/useContentItems";
import { useContentItemTable } from "./hooks/useContentItemTable";
import { useTranslation } from "react-i18next";
import { DataTableViewOptions } from "@/components/table/DataTableViewOptions";
import { useAuthStore } from "@/stores/authStore";
import { useDialogStore } from "@/stores/dialogStore";
import { useNavigate as useAppNavigate, useLoaderData, useParams } from "@tanstack/react-router";
import { BaseCardGrid } from "@/components/custom-ui/data-display/card/BaseCardGrid";
import { BaseCard } from "@/components/custom-ui/data-display/card/BaseCard";
import { ContentDisplayModes } from "./constants/contentDisplayModes";
import { DataTableRowActions, type ActionItem } from "@/components/table/DataTableRowActions";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, EditIcon, TrashIcon, Layers } from "lucide-react";
import type { ContentTypeDto, ContentItemDto } from "@/gen/model";
import { ContentResourcesDrawer } from "./components/drawers/ContentResourcesDrawer";
import { DynamicIcon } from "@/components/custom-ui/DynamicIcon";

export function ContentItemPage({ useSearch, useNavigate }: ResourcePageProps) {
    const { t } = useTranslation(["contentItems", "common"]);
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const openDialog = useDialogStore((state) => state.openDialog);

    const search = useSearch();
    const navigate = useNavigate();
    const appNavigate = useAppNavigate();

    const parentData = useLoaderData({
        from: "/_protected/_project/projects/$projectId/contents/$typeKey",
    }) as { contentType: ContentTypeDto } | undefined;
    const contentType = parentData?.contentType;

    const { projectId, typeKey } = useParams({
        from: "/_protected/_project/projects/$projectId/contents/$typeKey",
    });

    const [drawerContent, setDrawerContent] = useState<{ id: string; name: string } | null>(null);

    const resourceQuery = useResourceQuery(search, navigate);

    const { data, isLoading } = useContentItems(search as any, {
        projectId,
        contentTypeKey: typeKey,
    });

    const handleViewResources = (item: ContentItemDto) => {
        if (item.id) {
            setDrawerContent({ id: item.id, name: item.name || "Content Item" });
        }
    };

    const { table, columns } = useContentItemTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resourceQuery,
        typeKey,
        projectId,
        onViewResources: handleViewResources,
    });

    const canCreate = hasPermission("contentitems:create");

    const displayConfig = (contentType?.displayConfig as any) || {};
    const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
        const mode = displayConfig.mode;
        if (mode === ContentDisplayModes.TABLE || mode === "table") return 'table';
        return 'grid';
    });

    useEffect(() => {
        const mode = (contentType?.displayConfig as any)?.mode;
        if (mode === ContentDisplayModes.TABLE || mode === "table") {
            setViewMode('table');
        } else if (mode === ContentDisplayModes.LIST_CARD || mode === "card" || mode === "list_card" || mode === "grid") {
            setViewMode('grid');
        } else {
            setViewMode('grid');
        }
    }, [contentType, typeKey]);

    const getCardData = (item: any) => {
        const values = item.values || {};
        const thumbnailKey = displayConfig?.thumbnailField;
        const thumbnailUrl = item.thumbnailUrl || (thumbnailKey ? item[thumbnailKey] || values[thumbnailKey] : null) || values.avatarUrl || values.imageUrl || values.thumbnail || values.cover || values.avatar;

        const titleKey = displayConfig?.titleField || "name";
        const title = item[titleKey] || values[titleKey] || item.name || "Untitled";

        const descKey = displayConfig?.descriptionField || "description";
        const description = item[descKey] || values[descKey] || values.description || values.summary || "";

        return { title, description, thumbnailUrl };
    };

    const getItemActions = (item: any) => {
        const actions: ActionItem[] = [
            {
                label: t("actions.viewResources", { defaultValue: "View Resources" }),
                icon: Layers,
                onClick: () => handleViewResources(item),
            },
            hasPermission("contentitems:update") && {
                label: t("common:edit", { defaultValue: "Edit" }),
                icon: EditIcon,
                onClick: () => appNavigate({
                    to: "/projects/$projectId/contents/$typeKey/$contentItemId/edit",
                    params: { projectId, typeKey, contentItemId: item.id! },
                }),
            },
            hasPermission("contentitems:delete") && {
                label: t("common:delete", { defaultValue: "Delete" }),
                icon: TrashIcon,
                onClick: () => openDialog("delete-content-item", { id: item.id!, typeKey, projectId }),
                destructive: true,
                separatorBefore: true,
            }
        ].filter(Boolean) as ActionItem[];
        return actions;
    };

    return (
        <>
            <ResourcePageShell
                icon={<DynamicIcon name={contentType?.icon} className="h-6 w-6 text-primary shrink-0" />}
                title={contentType?.displayName || t("page.title", { defaultValue: "Content Items" })}
                onAdd={canCreate ? () => appNavigate({ to: "/projects/$projectId/contents/$typeKey/new", params: { projectId, typeKey } }) : undefined}
                addLabel={contentType?.name ? `Add ${contentType.name}` : t("actions.create", { defaultValue: "Add Content Item" })}
                resource={resourceQuery}
                filterConfig={contentItemFilterConfig}
                hideAdvancedFilters={true}
                searchPlaceholder={t("page.searchPlaceholder", { defaultValue: "Search..." })}
                renderViewOptions={
                    <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded-md p-0.5 bg-muted/20">
                            <Button
                                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-7 w-7"
                                onPress={() => setViewMode('grid')}
                                aria-label="Grid View"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-7 w-7"
                                onPress={() => setViewMode('table')}
                                aria-label="Table View"
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>
                        <DataTableViewOptions table={table} />
                    </div>
                }
            >
                {viewMode === 'table' ? (
                    <ContentItemTable
                        table={table}
                        columns={columns}
                        isLoading={isLoading}
                        content={contentType?.displayName}
                    />
                ) : (
                    <BaseCardGrid
                        table={table}
                        isLoading={isLoading}
                        renderCard={(item) => {
                            const { title, description, thumbnailUrl } = getCardData(item);
                            const actions = getItemActions(item);

                            return (
                                <BaseCard
                                    key={item.id}
                                    title={title}
                                    description={description}
                                    thumbnailUrl={thumbnailUrl}
                                    icon={contentType?.icon ? (props) => <DynamicIcon name={contentType.icon} {...props} /> : undefined}
                                    action={actions.length > 0 ? <DataTableRowActions actions={actions} /> : undefined}
                                    onClick={() => appNavigate({
                                        to: "/projects/$projectId/contents/$typeKey/$contentItemId/edit",
                                        params: { projectId, typeKey, contentItemId: item.id }
                                    })}
                                />
                            );
                        }}
                    />
                )}
            </ResourcePageShell>

            {/* Slide-over Drawer to View and Manage Linked Resources */}
            <ContentResourcesDrawer
                isOpen={Boolean(drawerContent)}
                onClose={() => setDrawerContent(null)}
                contentId={drawerContent?.id || null}
                contentName={drawerContent?.name || ""}
                projectId={projectId}
            />
        </>
    );
}
