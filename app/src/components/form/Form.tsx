import { FormProvider, type FieldValues, type UseFormReturn, type SubmitHandler } from 'react-hook-form';
import { FormIdContext } from './form-context';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface FormProps<
    TFieldValues extends FieldValues,
    TTransformedValues extends FieldValues | undefined = undefined
> extends Omit<React.ComponentPropsWithoutRef<'form'>, 'onSubmit'> {
    form: UseFormReturn<TFieldValues, any, TTransformedValues>;
    onSubmit: SubmitHandler<TTransformedValues extends FieldValues ? TTransformedValues : TFieldValues>;
    formId?: string;
}

export function Form<
    TFieldValues extends FieldValues,
    TTransformedValues extends FieldValues | undefined = undefined
>({
    form,
    onSubmit,
    formId,
    children,
    className,
    ...props
}: FormProps<TFieldValues, TTransformedValues>) {
    const id = formId ?? useId();

    return (
        <FormIdContext.Provider value={id}>
            <FormProvider {...form}>
                <form 
                    className={cn('w-full flex flex-col gap-6 @container', className)} 
                    id={id} 
                    {...props} 
                    onSubmit={form.handleSubmit(onSubmit as any, (errors) => console.error("Form validation failed:", errors))}
                >
                    {children}
                </form>
            </FormProvider>
        </FormIdContext.Provider>
    );
}
