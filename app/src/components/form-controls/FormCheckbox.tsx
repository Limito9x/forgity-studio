import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { Checkbox } from "../ui/checkbox";
import type { BaseFormControlProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "./BaseFormField";

export interface FormCheckboxProps<T extends FieldValues>
    extends BaseFormControlProps<T> {
    className?: string;
    disabled?: boolean;
}

export function FormCheckbox<T extends FieldValues>({
    className,
    disabled,
    ...rest
}: FormCheckboxProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <div>
                    <Checkbox
                        id={field.field_id}
                        name={field.input_name}
                        isSelected={field.value}
                        onChange={field.onChange}
                        isDisabled={disabled}
                        className={className}
                    />
                </div>
            )}
        />
    );
}


export interface FormCheckboxProperties {
    required?: boolean;
    requiredMsg?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "checkbox": {
            properties: FormCheckboxProperties,
            defaultValue: boolean
        }
    }
}
registerField({
    type: "checkbox",
    component: FormCheckbox,
    buildSchema: (p: FormCheckboxProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.boolean({ message: reqMsg });
        if (p.required) s = s.refine(val => val === true, reqMsg);
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: []
});
