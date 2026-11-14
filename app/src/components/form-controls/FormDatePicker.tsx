import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { BaseFormField } from "./BaseFormField";
import { DatePicker, type DatePickerProps } from "../ui/date-picker";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";

export interface FormDatePickerProps<T extends FieldValues>
    extends BaseFormControlProps<T>,
    OmitFormProps<DatePickerProps> {}

export function FormDatePicker<T extends FieldValues>({
    placeholder,
    className,
    disabled,
    ...rest
}: FormDatePickerProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={cn("w-full", className)}
                />
            )}
        />
    );
}


export interface FormDatePickerProperties {
    required?: boolean;
    requiredMsg?: string;
    placeholder?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "date": {
            properties: FormDatePickerProperties,
            defaultValue: Temporal.PlainDate
        }
    }
}
registerField({
    type: "date",
    component: FormDatePicker,
    buildSchema: (p: FormDatePickerProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.instanceof(Temporal.PlainDate, { message: reqMsg });
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: []
});
