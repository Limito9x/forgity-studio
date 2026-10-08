import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { DataTableRowActions, type ActionItem } from "@/components/table/DataTableRowActions";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import type { ColumnDef } from "@tanstack/react-table";
import type { ContentItemDto } from "@/gen/model";
import { EditIcon, TrashIcon, TypeIcon, ImageIcon, Layers } from "lucide-react";
import { useDataTable } from "@/lib/useDataTable";
import { useDialogStore } from "@/stores/dialogStore";

export interface UseContentItemTableOptions {
    data: ContentItemDto[];
    totalCount: number;
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;
    typeKey: string;
    projectId: string;
    onViewResources?: (item: ContentItemDto) => void;
}

export function useContentItemTable({ data, totalCount, resource, typeKey, projectId, onViewResources }: UseContentItemTableOptions) {
    const { t } = useTranslation(["contentItems", "common"]);
    const navigate = useNavigate();
    const openDialog = useDialogStore((state) => state.openDialog);
    const hasPermission = useAuthStore((state) => state.hasPermission);


    const columns = useMemo<ColumnDef<ContentItemDto>[]>(() => {

        return [
            {
                accessorKey: "thumbnailUrl",
                header: () => t("fields.thumbnail", { defaultValue: "Thumbnail" }),
                enableSorting: false,
                size: 70,
                meta: {
                    label: t("fields.thumbnail", { defaultValue: "Thumbnail" }),
                    icon: ImageIcon,
                    headerClassName: "w-[70px] text-center",
                    cellClassName: "w-[70px] text-center",
                },
                cell: ({ row }) => {
                    const url = row.original.thumbnailUrl;
                    return (
                        <div className="w-8 h-8 rounded-md overflow-hidden bg-muted/40 border shrink-0 flex items-center justify-center mx-auto shadow-2xs">
                            {url ? (
                                <img src={url} alt={row.original.name} className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/40" />
                            )}
                        </div>
                    );
                },
            },
            {
                accessorKey: "name",
                header: () => t("fields.name", { defaultValue: "Name" }),
                enableSorting: false,
                meta: { label: t("fields.name", { defaultValue: "Name" }), icon: TypeIcon },
            },
            {
                id: "actions",
                enableSorting: false,
                size: 50,
                meta: {
                    headerClassName: "w-[50px] text-right",
                    cellClassName: "w-[50px] text-right",
                },
                cell: ({ row }) => {
                    const item = row.original;
                    const actions = [
                        onViewResources && {
                            label: t("actions.viewResources", { defaultValue: "View Resources" }),
                            icon: Layers,
                            onClick: () => onViewResources(item),
                        },
                        hasPermission("contentitems:update") && {
                            label: t("common:edit", { defaultValue: "Edit" }),
                            icon: EditIcon,
                            onClick: () => navigate({
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

                    return <DataTableRowActions actions={actions} />;
                },
            },
        ];
    }, [navigate, hasPermission, t, projectId, openDialog, onViewResources, typeKey]);

    const table = useDataTable({ data, columns, totalCount, resource });

    return { table, columns };
}
