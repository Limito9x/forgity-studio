import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableRowActions } from "@/components/table/DataTableRowActions";
import type { AuditLogDto } from "@/gen/model";
import { EyeIcon, ActivityIcon, FileTextIcon, ClockIcon, HashIcon, UserIcon } from "lucide-react";
import { useDataTable } from "@/lib/useDataTable";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Temporal } from "@js-temporal/polyfill";

export interface UseAuditLogTableProps {
    data: AuditLogDto[];
    totalCount: number;
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;
}

export function useAuditLogTable({
    data,
    totalCount,
    resource,
}: UseAuditLogTableProps) {
    const { t } = useTranslation(["common"]);
    const navigate = useNavigate();

    const columns = useMemo<ColumnDef<AuditLogDto>[]>(
        () => [
            {
                accessorKey: "action",
                header: () => "Action",
                meta: { label: "Action", icon: ActivityIcon },
                cell: (info) => <div className="font-medium text-foreground">{info.getValue() as string}</div>,
                enableSorting: true,
                enableHiding: false,
            },
            {
                accessorKey: "entityName",
                header: () => "Entity",
                meta: { label: "Entity", icon: FileTextIcon },
                cell: (info) => <div>{info.getValue() as string}</div>,
                enableSorting: true,
            },
            {
                accessorKey: "entityId",
                header: () => "Entity ID",
                meta: { label: "Entity ID", icon: HashIcon },
                cell: (info) => <div className="text-muted-foreground text-xs truncate max-w-[100px]">{info.getValue() as string}</div>,
                enableSorting: false,
            },
            {
                accessorKey: "userId",
                header: () => "User ID",
                meta: { label: "User", icon: UserIcon },
                cell: (info) => <div className="text-muted-foreground text-xs truncate max-w-[100px]">{info.getValue() as string ?? "-"}</div>,
                enableSorting: false,
            },
            {
                accessorKey: "timestamp",
                header: () => "Timestamp",
                meta: { label: "Timestamp", icon: ClockIcon },
                cell: (info) => {
                    const val = info.getValue() as string;
                    if (!val) return "-";
                    return <div>{Temporal.Instant.from(val).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>;
                },
                enableSorting: true,
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
                                    label: t("common:view", { defaultValue: "View" }),
                                    icon: EyeIcon,
                                    onClick: () => navigate({ to: `/system/audit-logs/${item.id}` }),
                                },
                            ]}
                        />
                    );
                },
            },
        ],
        [navigate, t]
    );

    const table = useDataTable({
        data,
        columns,
        totalCount,
        resource,
    });

    return { table, columns };
}
