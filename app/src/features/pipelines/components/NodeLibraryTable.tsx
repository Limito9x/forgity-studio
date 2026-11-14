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
        <div className="[&_[data-slot=table-container]]:max-h-[calc(100vh-285px)] [&_[data-slot=table-container]]:overflow-y-auto [&_[data-slot=table-container]]:scrollbar-thin">
            <BaseTable
                table={table}
                columns={columns}
                isLoading={isLoading}
            />
        </div>
    );
}
