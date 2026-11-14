import { Loader2 } from 'lucide-react';
import { Button, type buttonVariants } from '@/components/ui/button';
import { BaseDialog, type BaseDialogProps } from './BaseDialog';
import type { VariantProps } from 'class-variance-authority';

export interface ConfirmDialogProps extends Omit<BaseDialogProps, 'children' | 'footer'> {
    confirmText?: string;
    cancelText?: string;
    variant?: VariantProps<typeof buttonVariants>['variant'];
    isLoading?: boolean;
    onConfirm: () => void;
}

export function ConfirmDialog({
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    isLoading = false,
    onConfirm,
    onOpenChange,
    ...props
}: ConfirmDialogProps) {
    const handleCancel = () => {
        if (!isLoading) {
            onOpenChange(false);
        }
    };

    const footer = (
        <>
            <Button variant="outline" onPress={handleCancel} isDisabled={isLoading}>
                {cancelText}
            </Button>
            <Button variant={variant} onPress={onConfirm} isDisabled={isLoading}>
                {isLoading && <Loader2 className="animate-spin" />}
                {confirmText}
            </Button>
        </>
    );

    return (
        <BaseDialog
            {...props}
            onOpenChange={(open) => {
                if (!isLoading) onOpenChange(open);
            }}
            footer={footer}
        />
    );
}
