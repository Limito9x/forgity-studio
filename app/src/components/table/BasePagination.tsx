import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export interface BasePaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    pageSize?: number;
    totalCount?: number;
    onPageSizeChange?: (pageSize: number) => void;
}

export function BasePagination({
    currentPage,
    totalPages,
    onPageChange,
    pageSize = 10,
    totalCount = 0,
    onPageSizeChange
}: BasePaginationProps) {
    if (totalPages <= 0) {
        return null;
    }

    // Tính toán dải hiển thị, ví dụ: 1-10 of 100
    const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const to = Math.min(currentPage * pageSize, totalCount);

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
            {/* Bên trái: Chọn số dòng hiển thị mỗi trang */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Rows per page</span>
                {onPageSizeChange ? (
                    <Select
                        aria-label="pagination-select"
                        value={String(pageSize)}
                        onChange={(val) => onPageSizeChange(Number(val))}
                    >
                        <SelectTrigger className="h-8 w-[70px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[10, 20, 50, 100].map((size) => (
                                <SelectItem textValue={String(size)} key={size} id={String(size)}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="text-sm font-semibold">{pageSize}</span>
                )}
            </div>

            {/* Bên phải: Range hiển thị & các nút điều hướng */}
            <div className="flex items-center gap-6">
                <span className="text-sm font-medium text-muted-foreground">
                    {from}-{to} of {totalCount}
                </span>

                <div className="flex items-center gap-1">
                    {/* Về trang đầu tiên (<<) */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onPress={() => onPageChange(1)}
                        isDisabled={currentPage === 1}
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>

                    {/* Về trang trước (<) */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onPress={() => onPageChange(currentPage - 1)}
                        isDisabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {/* Sang trang sau (>) */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onPress={() => onPageChange(currentPage + 1)}
                        isDisabled={currentPage === totalPages}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>

                    {/* Đến trang cuối cùng (>>) */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onPress={() => onPageChange(totalPages)}
                        isDisabled={currentPage === totalPages}
                    >
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}