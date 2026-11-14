import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { Textarea } from "../ui/textarea";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";
import { BaseFormField } from "./BaseFormField";

export interface FormTextareaProps<T extends FieldValues>
    extends BaseFormControlProps<T>,
    OmitFormProps<React.ComponentPropsWithoutRef<"textarea">> {
}

export function FormTextarea<T extends FieldValues>({
    placeholder,
    className,
    disabled,
    ...rest
}: FormTextareaProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <Textarea
                    {...field}
                    id={field.field_id}
                    name={field.input_name}
                    placeholder={placeholder}
                    disabled={disabled}
                    value={field.value ?? ""}
                    className={cn("w-full min-h-[100px]", className)}
                />
            )}
        />
    );
}


export interface FormTextareaProperties {
    required?: boolean;
    requiredMsg?: string;
    placeholder?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "textarea": {
            properties: FormTextareaProperties,
            defaultValue: string
        }
    }
}
registerField({
    type: "textarea",
    component: FormTextarea,
    buildSchema: (p: FormTextareaProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.string({ message: reqMsg });
        if (p.required) s = s.min(1, reqMsg);
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: []
});
