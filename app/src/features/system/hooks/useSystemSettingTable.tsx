import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableRowActions } from "@/components/table/DataTableRowActions";
import type { SystemSettingDto } from "@/gen/model";
import { useDialogStore } from "@/stores/dialogStore";
import { EditIcon, TypeIcon, KeyIcon, HashIcon, AlignLeftIcon } from "lucide-react";
import { useDataTable } from "@/lib/useDataTable";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import { useTranslation } from "react-i18next";

export interface UseSystemSettingTableProps {
    data: SystemSettingDto[];
    totalCount: number;
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;
}

export function useSystemSettingTable({
    data,
    totalCount,
    resource,
}: UseSystemSettingTableProps) {
    const { t } = useTranslation(["common"]);
    const openDialog = useDialogStore((state) => state.openDialog);

    const columns = useMemo<ColumnDef<SystemSettingDto>[]>(
        () => [
            {
                accessorKey: "key",
                header: () => "Key",
                meta: { label: "Key", icon: KeyIcon },
                cell: (info) => <div className="font-medium text-foreground">{info.getValue() as string}</div>,
                enableSorting: true,
                enableHiding: false,
            },
            {
                accessorKey: "value",
                header: () => "Value",
                meta: { label: "Value", icon: TypeIcon },
                cell: (info) => {
                    const val = info.getValue() as string;
                    return <div className="max-w-[300px] truncate">{val}</div>;
                },
                enableSorting: false,
            },
            {
                accessorKey: "valueType",
                header: () => "Type",
                meta: { label: "Type", icon: HashIcon },
                cell: (info) => <div>{info.getValue() as string}</div>,
                enableSorting: true,
            },
            {
                accessorKey: "description",
                header: () => "Description",
                meta: { label: "Description", icon: AlignLeftIcon },
                cell: (info) => {
                    const desc = info.getValue() as string;
                    return <div className="max-w-[300px] truncate text-muted-foreground">{desc || "-"}</div>;
                },
                enableSorting: false,
            },
            {
                id: "actions",
                enableSorting: false,
                cell: ({ row }) => {
                    const item = row.original;
                    return (
                        <DataTableRowActions
                            compact={false}
                            actions={[
                                {
                                    label: t("common:edit", { defaultValue: "Edit" }),
                                    icon: EditIcon,
                                    onClick: () => openDialog("update-system-setting", { id: item.id! }),
                                },
                            ]}
                        />
                    );
                },
            },
        ],
        [openDialog, t]
    );

    const table = useDataTable({
        data,
        columns,
        totalCount,
        resource,
    });

    return { table, columns };
}
