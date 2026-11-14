import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DialogBodyProps extends React.ComponentProps<'div'> {
    children?: ReactNode;
    className?: string;
    /**
     * Bật cuộn dọc tự động khi nội dung vượt quá kích thước modal (mặc định: true).
     * Khi tắt (false), nội dung sẽ hiển thị overflow tự nhiên (thích hợp cho popover/dropdown/canvas).
     */
    scrollable?: boolean;
}

/**
 * Component chuyên dụng bọc thân nội dung Dialog:
 * - Khắc phục CSS Grid/Flexbox `min-width: auto` Trap (chống bung bề ngang)
 * - Tự động cuộn dọc (overflow-y-auto) mà không làm mất Header và Footer
 */
export function DialogBody({
    children,
    className,
    scrollable = true,
    ...props
}: DialogBodyProps) {
    return (
        <div
            data-slot="dialog-body"
            className={cn(
                'min-w-0 max-w-full flex-1 py-1',
                scrollable ? 'min-h-0 overflow-y-auto overflow-x-hidden pr-1' : 'overflow-visible',
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
