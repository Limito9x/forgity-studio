import * as React from "react";
import { type useReactTable } from "@tanstack/react-table";
import { CardGrid } from "./CardGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { BasePagination } from "@/components/table/BasePagination";

export interface BaseCardGridProps<TData> {
    table: ReturnType<typeof useReactTable<TData>>;
    renderCard: (item: TData, index: number) => React.ReactNode;
    isLoading?: boolean;
    emptyState?: React.ReactNode;
}

export function BaseCardGrid<TData>({
    table,
    renderCard,
    isLoading,
    emptyState,
}: BaseCardGridProps<TData>) {
    const { pagination } = table.getState();
    const rows = table.getRowModel().rows;

    return (
        <div className="w-full min-w-0 space-y-6">
            {isLoading ? (
                <CardGrid>
                    {Array.from({ length: pagination.pageSize || 8 }).map((_, i) => (
                        <div key={`skeleton-card-${i}`} className="flex flex-col rounded-lg border bg-card p-4 space-y-3">
                            <Skeleton className="w-full aspect-video rounded-md" />
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-4 w-1/2" />
                        </div>
                    ))}
                </CardGrid>
            ) : rows.length === 0 ? (
                emptyState || (
                    <div className="flex h-48 w-full flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground p-8 text-center">
                        <p className="text-base font-medium">No results found</p>
                        <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search keywords.</p>
                    </div>
                )
            ) : (
                <CardGrid>
                    {rows.map((row, index) => (
                        <React.Fragment key={row.id}>
                            {renderCard(row.original, index)}
                        </React.Fragment>
                    ))}
                </CardGrid>
            )}

            <BasePagination
                currentPage={table.getState().pagination.pageIndex + 1}
                totalPages={table.getPageCount()}
                pageSize={table.getState().pagination.pageSize}
                totalCount={table.getRowCount ? table.getRowCount() : 0}
                onPageChange={(p) => table.setPageIndex(p - 1)}
                onPageSizeChange={(s) => table.setPageSize(s)}
            />
        </div>
    );
}
