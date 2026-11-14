import { useTranslation } from "react-i18next";
import type { ColumnDef, Table } from "@tanstack/react-table";
import { BaseTable } from "@/components/table/BaseTable";

export interface RoleTableProps {
    table: Table<any>;
    columns: ColumnDef<any>[];
    isLoading: boolean;
}

export function RoleTable({
    table,
    columns,
    isLoading,
}: RoleTableProps) {
    const { t } = useTranslation("roles");

    return (
        <BaseTable
            table={table}
            columns={columns}
            isLoading={isLoading}
            caption={t("page.listCaption", { defaultValue: "Role list" })}
        />
    );
}
