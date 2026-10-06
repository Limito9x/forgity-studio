import { BaseTable } from "@/components/table/BaseTable";
import type { ColumnDef, Table } from "@tanstack/react-table";
import type { NodePaletteItemDto } from "@/gen/model";

export interface NodeLibraryTableProps {
    table: Table<NodePaletteItemDto>;
    columns: ColumnDef<NodePaletteItemDto>[];
    isLoading: boolean;
}

export function NodeLibraryTable({
    table,
    columns,
    isLoading,
}: NodeLibraryTableProps) {
    return (
        <BaseTable
            table={table}
            columns={columns}
            isLoading={isLoading}
            caption="Node Library"
        />
    );
}
