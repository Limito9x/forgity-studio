import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { DataTableRowActions, type ActionItem } from "@/components/table/DataTableRowActions";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { ContentItemDto } from "@/gen/model";
import { EditIcon, TrashIcon, TypeIcon, ImageIcon, Layers, KeyIcon } from "lucide-react";
import { useDataTable } from "@/lib/useDataTable";
import { useDialogStore } from "@/stores/dialogStore";
import { Checkbox } from "@/components/ui/checkbox";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

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
    const nav = useProjectNav({ projectId });
    const openDialog = useDialogStore((state) => state.openDialog);
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const columns = useMemo<ColumnDef<ContentItemDto>[]>(() => {
        return [
            {
                id: "select",
                header: ({ table }) => (
                    <div className="flex items-center justify-center pl-1">
                        <Checkbox
                            slot="selection"
                            isSelected={table.getIsAllPageRowsSelected()}
                            isIndeterminate={table.getIsSomePageRowsSelected()}
                            onChange={(checked) => table.toggleAllPageRowsSelected(checked)}
                            aria-label="Select all content items"
                        />
                    </div>
                ),
                cell: ({ row }) => (
                    <div className="flex items-center justify-center pl-1">
                        <Checkbox
                            slot="selection"
                            isSelected={row.getIsSelected()}
                            onChange={(checked) => row.toggleSelected(checked)}
                            aria-label={`Select ${row.original.name}`}
                        />
                    </div>
                ),
                enableSorting: false,
                enableHiding: false,
                size: 38,
            },
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
                cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.name}</span>,
            },
            {
                accessorKey: "key",
                header: () => t("fields.key", { defaultValue: "Key" }),
                enableSorting: false,
                meta: { label: t("fields.key", { defaultValue: "Key" }), icon: KeyIcon },
                cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.key}</span>,
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
                            onClick: () => nav.toContentItemEdit(typeKey, item.key || item.id!),
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
    }, [nav, hasPermission, t, projectId, openDialog, onViewResources, typeKey]);

    const table = useDataTable({
        data,
        columns,
        totalCount,
        resource,
        rowSelection,
        onRowSelectionChange: setRowSelection,
        getRowId: (row) => row.id!,
    });

    return { table, columns, rowSelection, setRowSelection };
}
