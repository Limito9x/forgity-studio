import { StaticCombobox, type StaticComboboxProps } from '@/components/custom-ui/inputs/combobox/StaticCombobox'
import { registerField } from "@/lib/field-registry";
import { BaseFormField } from './BaseFormField'
import type { BaseFormControlProps } from './type'
import type { FieldValues } from 'react-hook-form'
import { z } from 'zod'
import type { OptionItem } from '@/components/custom-ui/inputs/combobox/BaseCombobox';

export interface FormStaticComboboxProps<TFieldValues extends FieldValues, TValue = any>
    extends BaseFormControlProps<TFieldValues>,
    Omit<StaticComboboxProps<TValue>, 'value' | 'onValueChange' | 'options'> {
    options?: (OptionItem<TValue> | string)[];
    isLoading?: boolean;
    allowCustom?: boolean;
}

/**
 * FormStaticCombobox
 * Form Adapter cho StaticCombobox. Chỉ làm nhiệm vụ gắn kết StaticCombobox vào react-hook-form.
 */
export function FormStaticCombobox<TFieldValues extends FieldValues, TValue = any>({
    options,
    isLoading,
    allowCustom,
    ...rest
}: FormStaticComboboxProps<TFieldValues, TValue>) {

    const normalizedOptions = (options || []).map(opt =>
        typeof opt === "string" ? { label: opt, value: opt as unknown as TValue } : opt
    );

    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <StaticCombobox
                    {...rest}
                    id={field.field_id}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={normalizedOptions}
                    isLoading={isLoading}
                    allowCustom={allowCustom}
                />
            )}
        />
    )
}

export interface StaticComboboxProperties {
    required?: boolean;
    requiredMsg?: string;
    multiple?: boolean;
    placeholder?: string;
    disabled?: boolean;
    options?: (OptionItem<any> | string)[];
    dataSource?: any; // FieldDataSource
    allowCustom?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "combobox": {
            properties: StaticComboboxProperties,
            defaultValue: string | string[]
        }
    }
}
registerField({
    type: "combobox",
    component: FormStaticCombobox,
    buildSchema: (p: StaticComboboxProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        if (p.multiple) {
            let s = z.array(z.string());
            if (p.required) s = s.min(1, reqMsg);
            return p.required ? s : s.optional();
        }
        let s = z.string({ message: reqMsg });
        if (p.required) s = s.min(1, reqMsg);
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: [
        {
            name: "placeholder",
            fieldType: "text",
            label: "Placeholder"
        },
        {
            name: "multiple",
            fieldType: "switch",
            label: "Multiple Select?"
        },
        {
            name: "options",
            fieldType: "tags",
            label: "Static Options",
            fieldConfig: {
                placeholder: "Add options",
            },
            isRequired: true
        }
    ]
});
