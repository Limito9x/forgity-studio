import { BaseTable } from "@/components/table/BaseTable";
import type { ColumnDef, Table as TanstackTable } from "@tanstack/react-table";
import type { SystemSettingDto } from "@/gen/model";

interface SystemSettingTableProps {
    table: TanstackTable<SystemSettingDto>;
    columns: ColumnDef<SystemSettingDto>[];
    isLoading: boolean;
}

export function SystemSettingTable({
    table,
    columns,
    isLoading,
}: SystemSettingTableProps) {
    return (
        <BaseTable 
            table={table} 
            columns={columns} 
            isLoading={isLoading} 
        />
    );
}
