import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { BaseFormField } from "./BaseFormField";
import { DateRangePicker, type DateRangePickerProps } from "../ui/date-range-picker";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";

export interface FormDateRangeProps<T extends FieldValues>
    extends BaseFormControlProps<T>,
    OmitFormProps<DateRangePickerProps> { }

export function FormDateRange<T extends FieldValues>({
    placeholder,
    className,
    disabled,
    ...rest
}: FormDateRangeProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <DateRangePicker
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


export interface FormDateRangeProperties {
    required?: boolean;
    requiredMsg?: string;
    placeholder?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "dateRange": {
            properties: FormDateRangeProperties,
            defaultValue: { from: Temporal.PlainDate, to: Temporal.PlainDate }
        }
    }
}
registerField({
    type: "dateRange",
    component: FormDateRange,
    buildSchema: (p: FormDateRangeProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.object({
            from: z.instanceof(Temporal.PlainDate, { message: reqMsg }),
            to: z.instanceof(Temporal.PlainDate, { message: reqMsg })
        });
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: []
});
