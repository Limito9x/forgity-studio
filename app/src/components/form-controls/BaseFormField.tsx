import type { BaseFormControlProps } from "./type";
import {
    Controller,
    type ControllerRenderProps,
    type FieldValues,
    type Path,
} from "react-hook-form";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from "@/components/ui/field"
import { useFormId } from "../form/form-context";

interface BaseFormFieldProps<
    T extends FieldValues,
> extends BaseFormControlProps<T> {
    render: (field: ControllerRenderProps<T, Path<T>> & {
        field_id: string
        autoComplete?: string
        input_name: string   // name dùng cho input element
    }) => React.ReactNode
}

export function BaseFormField<T extends FieldValues>({
    control,
    name,
    label,
    description,
    autoComplete,
    isRequired,
    render,
    defaultValue,
    ...rest
}: BaseFormFieldProps<T> & Record<string, any>) {
    const formId = useFormId();
    const field_id = formId ? `${formId}_${name}` : name
    const resolvedinput_name = autoComplete ?? (formId ? `${formId}_${name}` : name)

    const isFieldRequired = isRequired ?? rest.rules?.required;
    const computedRules = rest.rules ?? (isFieldRequired ? {
        validate: (val: any) => {
            if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
                return `${label || name} is required`;
            }
            return true;
        }
    } : undefined);

    return (
        <Controller
            control={control}
            name={name}
            defaultValue={defaultValue}
            rules={computedRules}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    {label && (
                        <FieldLabel htmlFor={field_id}>
                            {label}
                            {isRequired && <span className="text-destructive ml-1">*</span>}
                        </FieldLabel>
                    )}
                    {render({
                        ...field,
                        ...rest,
                        field_id,
                        autoComplete,
                        input_name: resolvedinput_name,
                    })}
                    {description && (
                        <FieldDescription>
                            {description}
                        </FieldDescription>
                    )}
                    {fieldState.error && (
                        <FieldError>
                            {fieldState.error.message}
                        </FieldError>
                    )}
                </Field>
            )
            }
        />
    );
}