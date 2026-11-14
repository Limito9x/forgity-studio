import type { ReactNode } from 'react';
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DialogBody } from './DialogBody';
import { cn } from '@/lib/utils';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
export type DialogHeight = 'auto' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface BaseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
    className?: string;
    bodyClassName?: string;
    size?: DialogSize;
    height?: DialogHeight;
    scrollable?: boolean;
}

const sizeClasses: Record<DialogSize, string> = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
    full: 'sm:max-w-[95vw] w-full',
};

const heightClasses: Record<DialogHeight, string> = {
    auto: 'h-auto',
    sm: 'h-[380px]',
    md: 'h-[520px]',
    lg: 'h-[680px]',
    xl: 'h-[820px]',
    full: 'h-[calc(100vh-3.5rem)]',
};

export { DialogBody };

export function BaseDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    footer,
    className,
    bodyClassName,
    size = 'md',
    height = 'auto',
    scrollable = true,
}: BaseDialogProps) {
    return (
        <Dialog
            isOpen={open}
            onOpenChange={onOpenChange}
            className={cn(sizeClasses[size], heightClasses[height], className)}
        >
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>

            <DialogBody className={cn(!scrollable && 'overflow-visible', bodyClassName)}>
                {children}
            </DialogBody>

            {footer && <DialogFooter>{footer}</DialogFooter>}
        </Dialog>
    );
}
