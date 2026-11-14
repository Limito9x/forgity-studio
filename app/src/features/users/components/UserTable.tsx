import { useTranslation } from "react-i18next";
import { BaseTable } from "@/components/table/BaseTable";
import type { ColumnDef, Table } from "@tanstack/react-table";
import type { UserDto } from "@/gen/model";

export interface UserTableProps {
    table: Table<UserDto>;
    columns: ColumnDef<UserDto>[];
    isLoading: boolean;
}

export function UserTable({
    table,
    columns,
    isLoading,
}: UserTableProps) {
    const { t } = useTranslation(["users", "common"]);

    return (
        <BaseTable
            table={table}
            columns={columns}
            isLoading={isLoading}
            caption={t("table.caption")}
        />
    );
}

