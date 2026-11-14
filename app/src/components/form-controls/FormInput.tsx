import { registerField } from "@/lib/field-registry";
import { BaseFormField } from "./BaseFormField";
import { Input } from "../ui/input";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";
import { z } from "zod";

export interface FormInputProps<T extends FieldValues>
    extends BaseFormControlProps<T>,
    OmitFormProps<React.ComponentPropsWithoutRef<"input">> {
    type?: React.HTMLInputTypeAttribute;
}

export function FormInput<T extends FieldValues>({
    type = "text",
    placeholder,
    className,
    disabled,
    ...rest
}: FormInputProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <Input
                    {...field}
                    id={field.field_id}           // login-form_email
                    name={field.input_name}       // login-form_email (input element)
                    autoComplete={field.autoComplete}
                    type={type}
                    placeholder={placeholder}
                    disabled={disabled}
                    value={field.value ?? ""}
                    className={cn("w-full", className)}
                />
            )}
        />
    );
}

export interface FormInputProperties {
    required?: boolean;
    requiredMsg?: string;
    min?: number;
    max?: number;
    email?: boolean;
    placeholder?: string;
    type?: React.HTMLInputTypeAttribute;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "text": {
            properties: FormInputProperties,
            defaultValue: string
        }
    }
}
registerField({
    type: "text",
    component: FormInput,
    buildSchema: (p: FormInputProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.string({ message: reqMsg });
        if (p.required) s = s.min(1, reqMsg);
        if (p.min) s = s.min(p.min, `Min length is ${p.min}`);
        if (p.max) s = s.max(p.max, `Max length is ${p.max}`);
        if (p.email) s = s.email("Invalid email");

        if (!p.required) {
            return s.optional().nullable();
        }
        return s;
    },
    builderFields: [
        {
            name: "max",
            fieldType: "number",
            label: "Max Length",
        },
        {
            name: "placeholder",
            fieldType: "text",
            label: "Placeholder",
        }
    ]
});
