import { registerField } from "@/lib/field-registry";
import { BaseFormField } from "./BaseFormField";
import { BaseNumberInput, type BaseNumberInputProps } from "@/components/custom-ui/inputs/number-input/BaseNumberInput";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";
import type { BaseFieldRules } from "@/lib/field-registry";
import { z } from "zod";
import { cn } from "@/lib/utils";

export interface FormNumberRules extends BaseFieldRules {
    min?: number;
    max?: number;
}

export type FormNumberInputProps<T extends FieldValues> = BaseFormControlProps<T> & OmitFormProps<BaseNumberInputProps>;

export function FormNumberInput<T extends FieldValues>({
    placeholder,
    className,
    disabled,
    min,
    max,
    allowNegative,
    decimalScale,
    thousandSeparator,
    ...rest
}: FormNumberInputProps<T>) {

    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <BaseNumberInput
                    {...field}
                    id={field.field_id}
                    name={field.input_name}
                    autoComplete={field.autoComplete}
                    placeholder={placeholder}
                    disabled={disabled}
                    min={min}
                    max={max}
                    allowNegative={allowNegative}
                    decimalScale={decimalScale}
                    thousandSeparator={thousandSeparator}
                    value={field.value ?? ""}
                    className={cn("w-full", className)}
                />
            )}
        />
    );
}

export interface FormNumberProperties {
    required?: boolean;
    requiredMsg?: string;
    min?: number;
    max?: number;
    allowNegative?: boolean;
    decimalScale?: number;
    thousandSeparator?: boolean;
    placeholder?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "number": {
            properties: FormNumberProperties,
            defaultValue: number
        }
    }
}
registerField({
    type: "number",
    component: FormNumberInput,
    buildSchema: (p: FormNumberProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.number({ message: reqMsg });
        if (p.min !== undefined) s = s.min(p.min, `Min is ${p.min}`);
        if (p.max !== undefined) s = s.max(p.max, `Max is ${p.max}`);

        if (!p.required) {
            return s.optional().nullable();
        }
        return s;
    },
    builderFields: [
        {
            name: "min",
            fieldType: "number",
            label: "Minimum Value"
        },
        {
            name: "max",
            fieldType: "number",
            label: "Maximum Value"
        },
        {
            name: "allowNegative",
            fieldType: "switch",
            label: "Allow Negative?"
        },
        {
            name: "decimalScale",
            fieldType: "number",
            label: "Decimal Scale"
        },
        {
            name: "thousandSeparator",
            fieldType: "switch",
            label: "Thousand Separator?"
        },
    ]
});
