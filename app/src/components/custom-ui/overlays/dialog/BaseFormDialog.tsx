import type { ReactNode } from 'react';
import { BaseDialog, type BaseDialogProps } from './BaseDialog';
import { Button } from '@/components/ui/button';
import { FormSubmitButton } from '@/components/form/FormSubmitButton';

export interface BaseFormDialogProps extends Omit<BaseDialogProps, 'footer'> {
    formId: string;
    isPending?: boolean;
    cancelText?: string;
    submitText?: string;
    children: ReactNode;
}

export function BaseFormDialog({
    formId,
    isPending = false,
    cancelText = 'Cancel',
    submitText = 'Save',
    children,
    onOpenChange,
    ...props
}: BaseFormDialogProps) {
    const footer = (
        <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onPress={() => onOpenChange(false)} isDisabled={isPending}>
                {cancelText}
            </Button>
            <FormSubmitButton formId={formId} loading={isPending}>
                {submitText}
            </FormSubmitButton>
        </div>
    );

    return (
        <BaseDialog
            {...props}
            onOpenChange={(open) => {
                if (!isPending) onOpenChange(open);
            }}
            footer={footer}
        >
            {children}
        </BaseDialog>
    );
}
