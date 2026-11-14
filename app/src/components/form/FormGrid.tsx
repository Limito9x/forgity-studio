import { cn } from "@/lib/utils";
import React from "react";

export interface FormGridProps extends React.ComponentProps<"div"> {
    /**
     * Số cột muốn chia khi form đủ chiều rộng.
     * Mặc định là 2 cột.
     */
    cols?: 1 | 2 | 3 | 4;
}

/**
 * FormGrid sử dụng Tailwind CSS Container Queries (@container) thay vì Media Queries.
 * Nó sẽ tự động dàn cột dựa trên chiều rộng của thẻ bọc ngoài (Base Form) chứ không phải toàn màn hình.
 * Nhờ đó Form hiển thị tốt cả trên Dialog nhỏ lẫn Page lớn.
 */
export function FormGrid({ cols = 2, className, children, ...props }: FormGridProps) {
    return (
        <div
            className={cn(
                "grid grid-cols-1 gap-4",
                {
                    // Lớn hơn @md (~448px)
                    "@md:grid-cols-2": cols === 2,
                    "@md:grid-cols-3": cols === 3,
                    "@md:grid-cols-4": cols === 4,
                },
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
