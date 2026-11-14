import { useReactTable, getCoreRowModel, type ColumnDef, type RowSelectionState, type OnChangeFn, type Row } from "@tanstack/react-table";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";

export interface UseDataTableOptions<TData> {
    data: TData[];
    columns: ColumnDef<TData>[];
    totalCount: number;
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;
    rowSelection?: RowSelectionState;
    onRowSelectionChange?: OnChangeFn<RowSelectionState>;
    enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
    getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;
}

export function useDataTable<TData>({
    data,
    columns,
    totalCount,
    resource,
    rowSelection,
    onRowSelectionChange,
    enableRowSelection,
    getRowId,
}: UseDataTableOptions<TData>) {
    return useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        manualSorting: true,
        rowCount: totalCount,
        getRowId,
        enableRowSelection,
        onRowSelectionChange,
        state: {
            sorting: resource.sorting,
            pagination: resource.pagination,
            ...(rowSelection !== undefined ? { rowSelection } : {}),
        },
        onSortingChange: resource.onSortingChange,
        onPaginationChange: resource.onPaginationChange,
    });
}
