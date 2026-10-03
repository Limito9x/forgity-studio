import type { ReactNode } from 'react';
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';

export interface BaseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
    className?: string;
    size?: DialogSize;
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

export function BaseDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    footer,
    className,
    size = 'md',
}: BaseDialogProps) {
    return (
        <Dialog isOpen={open} onOpenChange={onOpenChange} className={cn(sizeClasses[size], className)}>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            {children}
            {footer && <DialogFooter>{footer}</DialogFooter>}
        </Dialog>
    );
}
