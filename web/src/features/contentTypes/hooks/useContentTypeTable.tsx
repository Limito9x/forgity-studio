import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogStore } from "@/stores/dialogStore";
import { useAuthStore } from "@/stores/authStore";
import { DataTableRowActions, type ActionItem } from "@/components/table/DataTableRowActions";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { ContentTypeDto } from "@/gen/model";
import { EditIcon, TrashIcon, TypeIcon, KeyIcon, FileTextIcon, BlocksIcon } from "lucide-react";
import { useDataTable } from "@/lib/useDataTable";
import { useProjectNav } from "@/lib/navigation/useProjectNav";
import { DynamicIcon } from "@/components/custom-ui/DynamicIcon";
import { Checkbox } from "@/components/ui/checkbox";

export interface UseContentTypeTableOptions {
    data: ContentTypeDto[];
    totalCount: number;
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;
}

export function useContentTypeTable({ data, totalCount, resource }: UseContentTypeTableOptions) {
    const { t } = useTranslation(["contentTypes", "common"]);
    const openDialog = useDialogStore((state) => state.openDialog);
    const hasPermission = useAuthStore((state) => state.hasPermission);
    const nav = useProjectNav();
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const columns = useMemo<ColumnDef<ContentTypeDto>[]>(
        () => [
            {
                id: "select",
                header: ({ table }) => (
                    <div className="flex items-center justify-center pl-1">
                        <Checkbox
                            slot="selection"
                            isSelected={table.getIsAllPageRowsSelected()}
                            isIndeterminate={table.getIsSomePageRowsSelected()}
                            onChange={(checked) => table.toggleAllPageRowsSelected(checked)}
                            aria-label="Select all content types"
                        />
                    </div>
                ),
                cell: ({ row }) => (
                    <div className="flex items-center justify-center pl-1">
                        <Checkbox
                            slot="selection"
                            isSelected={row.getIsSelected()}
                            onChange={(checked) => row.toggleSelected(checked)}
                            aria-label={`Select ${row.original.displayName}`}
                        />
                    </div>
                ),
                enableSorting: false,
                enableHiding: false,
                size: 38,
            },
            {
                accessorKey: "displayName",
                header: () => t("fields.displayName", { defaultValue: "Display Name" }),
                meta: { label: t("fields.displayName", { defaultValue: "Display Name" }), icon: TypeIcon },
                cell: ({ row }) => {
                    return (
                        <div className="flex items-center space-x-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 border border-border/50 text-muted-foreground">
                                <DynamicIcon name={row.original.icon} className="h-4 w-4" />
                            </div>
                            <span className="font-semibold text-foreground">{row.original.displayName}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: "key",
                header: () => t("fields.key", { defaultValue: "Key" }),
                meta: { label: t("fields.key", { defaultValue: "Key" }), icon: KeyIcon },
            },
            {
                accessorKey: "description",
                header: () => t("fields.description", { defaultValue: "Description" }),
                meta: { label: t("fields.description", { defaultValue: "Description" }), icon: FileTextIcon },
                cell: ({ row }) => {
                    return <span className="text-muted-foreground truncate max-w-[300px] inline-block">{row.original.description}</span>;
                },
            },
            {
                id: "actions",
                enableSorting: false,
                cell: ({ row }) => {
                    const item = row.original;
                    const actions = [
                        hasPermission("contenttypes:update") && {
                            label: t("actions.schemaBuilder", { defaultValue: "Schema Config" }),
                            icon: BlocksIcon,
                            onClick: () => {
                                nav.toContentTypeBuilder(item.id!);
                            },
                        },
                        hasPermission("contenttypes:update") && {
                            label: t("common:edit", { defaultValue: "Edit" }),
                            icon: EditIcon,
                            onClick: () => {
                                openDialog("update-content-type", { item });
                            },
                        },
                        hasPermission("contenttypes:delete") && {
                            label: t("common:delete", { defaultValue: "Delete" }),
                            icon: TrashIcon,
                            onClick: () => openDialog("delete-content-type", { id: item.id!, projectId: item.projectId! }),
                            destructive: true,
                            separatorBefore: true,
                        }
                    ].filter(Boolean) as ActionItem[];

                    return <DataTableRowActions actions={actions} />;
                },
            },
        ],
        [openDialog, hasPermission, t, nav]
    );

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
