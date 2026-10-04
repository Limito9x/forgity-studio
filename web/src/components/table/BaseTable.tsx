import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table"
import { Skeleton } from "../ui/skeleton";
import { type ColumnDef, useReactTable, flexRender } from "@tanstack/react-table"
import { BasePagination } from "./BasePagination";
import { useMemo } from "react";

import type { SortDescriptor } from "react-aria-components";

export interface BaseTableProps<TData> {
    table: ReturnType<typeof useReactTable<TData>>;
    columns: ColumnDef<TData>[];
    isLoading?: boolean;
    caption?: string;
    selectionMode?: "none" | "single" | "multiple";
}

export function BaseTable<TData>({
    table,
    columns,
    isLoading,
    caption,
    selectionMode,
}: BaseTableProps<TData>) {
    const { sorting, pagination } = table.getState();

    const sortDescriptor: SortDescriptor | undefined = sorting[0]
        ? { column: sorting[0].id, direction: sorting[0].desc ? "descending" : "ascending" }
        : undefined;

    const handleSortChange = (descriptor: SortDescriptor) => {
        const currentSort = sorting.length > 0 ? sorting[0] : null;
        const clickedColumn = String(descriptor.column);

        // React Aria cycles: Asc -> Desc -> Asc (vòng lặp vô tận)
        // Ta muốn đổi thành vòng lặp: Asc -> Desc -> Xóa Sort (Mặc định)
        if (
            currentSort && 
            currentSort.id === clickedColumn && 
            currentSort.desc === true && 
            descriptor.direction === "ascending"
        ) {
            table.setSorting([]);
        } else {
            table.setSorting([{ id: clickedColumn, desc: descriptor.direction === "descending" }]);
        }
    };

    const flatHeaders = table.getHeaderGroups().flatMap(hg => hg.headers);

    const hasSelectColumn = useMemo(
        () => flatHeaders.some(h => h.id === "select"),
        [flatHeaders]
    );

    const effectiveSelectionMode = selectionMode ?? (hasSelectColumn ? "multiple" : undefined);

    const rowHeaderId = useMemo(() => {
        const explicitHeader = flatHeaders.find(h => (h.column.columnDef.meta as any)?.isRowHeader);
        return explicitHeader
            ? explicitHeader.id
            : (flatHeaders.find(h => h.id !== "select" && h.id !== "actions")?.id || flatHeaders[0]?.id);
    }, [flatHeaders]);

    return (
        <div className="w-full min-w-0 space-y-4">
            <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                {caption && (
                    <div className="p-4 text-center text-sm text-muted-foreground bg-muted/20 border-b">
                        {caption}
                    </div>
                )}
                <Table
                    aria-label={caption || "Data table"}
                    sortDescriptor={sortDescriptor}
                    onSortChange={handleSortChange}
                    selectionMode={effectiveSelectionMode}
                >
                    <TableHeader>
                        {flatHeaders.map((header) => (
                            <TableHead
                                key={header.id}
                                id={header.id}
                                className="font-semibold py-3"
                                isRowHeader={header.id === rowHeaderId}
                                allowsSorting={header.column.getCanSort()}
                            >
                                {header.column.getCanSort() ? (
                                    <div className="flex items-center gap-2 select-none hover:text-foreground">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                        {{
                                            asc: <ArrowUp className="h-4 w-4" />,
                                            desc: <ArrowDown className="h-4 w-4" />,
                                        }[header.column.getIsSorted() as string] ?? (
                                                <ArrowUpDown className="h-4 w-4 opacity-50" />
                                            )}
                                    </div>
                                ) : (
                                    flexRender(header.column.columnDef.header, header.getContext())
                                )}
                            </TableHead>
                        ))}
                    </TableHeader>
                    <TableBody renderEmptyState={() => (
                        <div className="flex h-32 w-full items-center justify-center text-muted-foreground">
                            No results found.
                        </div>
                    )}>
                        {isLoading
                            ? Array.from({ length: pagination.pageSize }).map((_, i) => (
                                <TableRow key={`skeleton-${i}`} id={`skeleton-${i}`}>
                                    {columns.map((_, colIndex) => (
                                        <TableCell key={`skeleton-cell-${colIndex}`} id={`skeleton-${i}-cell-${colIndex}`} className="py-4">
                                            <Skeleton className="h-5 w-full max-w-[80%]" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                            : table.getRowModel().rows.map((item: any) => (
                                <TableRow key={item.id} id={item.id} className="hover:bg-muted/30 transition-colors">
                                    {item.getVisibleCells().map((cell: any) => (
                                        <TableCell key={cell.id} id={cell.id} className="py-3">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        }
                    </TableBody>
                </Table>
            </div>

            <BasePagination
                currentPage={table.getState().pagination.pageIndex + 1}
                totalPages={table.getPageCount()}
                pageSize={table.getState().pagination.pageSize}
                totalCount={table.getRowCount ? table.getRowCount() : 0}
                onPageChange={(p) => table.setPageIndex(p - 1)}
                onPageSizeChange={(s) => table.setPageSize(s)}
            />
        </div>
    )
}
