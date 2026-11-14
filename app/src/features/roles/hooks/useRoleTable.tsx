import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableRowActions } from "@/components/table/DataTableRowActions";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import { useDialogStore } from "@/stores/dialogStore";
import { EditIcon, TrashIcon, TypeIcon, ShieldIcon } from "lucide-react";
import { useDataTable } from "@/lib/useDataTable";

export interface UseRoleTableOptions {
    data: any[];
    totalCount: number;
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;
}

export function useRoleTable({ data, totalCount, resource }: UseRoleTableOptions) {
    const { t } = useTranslation("roles");
    const { openDialog } = useDialogStore();

    const columns = useMemo<ColumnDef<any>[]>(() => [
        {
            accessorKey: "name",
            header: t("fields.name", { defaultValue: "Name" }),
            meta: { label: t("fields.name", { defaultValue: "Name" }), icon: TypeIcon },
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <DataTableRowActions
                        actions={[
                            {
                                icon: EditIcon,
                                label: t("actions.update"),
                                onClick: () => openDialog("update-role", { id: item.id })
                            },
                            {
                                icon: ShieldIcon,
                                label: t("actions.permissions", { defaultValue: "Permissions" }),
                                onClick: () => openDialog("update-role-permissions", { id: item.id })
                            },
                            {
                                icon: TrashIcon,
                                label: t("actions.delete"),
                                onClick: () => openDialog("delete-role", { id: item.id }),
                                destructive: true,
                                separatorBefore: true
                            }
                        ]}
                    />
                );
            },
        },
    ], [t, openDialog]);

    const table = useDataTable({ data, columns, totalCount, resource });

    return { table, columns };
}
