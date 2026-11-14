import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormId } from './form-context';
import type { ComponentProps } from 'react';

export interface FormSubmitButtonProps extends Omit<ComponentProps<typeof Button>, 'children'> {
    loading?: boolean;
    formId?: string;
    children?: React.ReactNode;
}

export function FormSubmitButton({
    loading = false,
    formId,
    children,
    isDisabled,
    ...props
}: FormSubmitButtonProps) {
    const contextFormId = useFormId();
    const finalFormId = formId ?? contextFormId;

    return (
        <Button
            type="submit"
            form={finalFormId}
            isDisabled={isDisabled || loading}
            {...props}
        >
            {loading && <Loader2 className="animate-spin" />}
            {children}
        </Button>
    );
}
