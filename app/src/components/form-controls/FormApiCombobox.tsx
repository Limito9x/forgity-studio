import { ApiCombobox, type ApiComboboxProps } from '@/components/custom-ui/inputs/combobox/ApiCombobox'
import { BaseFormField } from './BaseFormField'
import type { BaseFormControlProps } from './type'
import type { FieldValues } from 'react-hook-form'

export interface FormApiComboboxProps<TFieldValues extends FieldValues, TValue = any>
    extends BaseFormControlProps<TFieldValues>,
    Omit<ApiComboboxProps<TValue>, 'value' | 'onValueChange'> {
}

/**
 * FormApiCombobox
 * Form Adapter cho ApiCombobox. Chỉ làm nhiệm vụ gắn kết ApiCombobox vào react-hook-form.
 */
export function FormApiCombobox<TFieldValues extends FieldValues, TValue = any>({
    ...rest
}: FormApiComboboxProps<TFieldValues, TValue>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <ApiCombobox
                    {...rest}
                    id={field.field_id}
                    value={field.value}
                    onValueChange={field.onChange}
                    useOptions={rest.useOptions}
                />
            )}
        />
    )
}

export interface FormApiComboboxProperties {
    endpoint?: string;
    labelKey?: string;
    valueKey?: string;
    required?: boolean;
    requiredMsg?: string;
    placeholder?: string;
    disabled?: boolean;
    multiple?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "relation": {
            properties: FormApiComboboxProperties,
            defaultValue: string
        }
    }
}

import { registerField } from '@/lib/field-registry';
import { z } from 'zod';
import { useContentTypes } from '@/features/contentTypes/hooks/useContentTypes';
import { useContentItems } from '@/features/contentItems/hooks/useContentItems'

registerField({
    type: "relation",
    component: FormApiCombobox,
    buildSchema: (p: FormApiComboboxProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = p.multiple ? z.array(z.string()) : z.string({ message: reqMsg });
        if (p.required) s = s.min(1, reqMsg);
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: [
        {
            name: "targetContentType",
            fieldType: "relation",
            label: "Target Content Type",
            description: "Select content type that you want to relate",
            isRequired: true,
            resolverFieldConfig(builderContext) {
                return {
                    useOptions: (search: string) => {

                        const { data, isLoading } = useContentTypes(
                            { globalKeyword: search, page: 1, pageSize: 10 },
                            builderContext?.projectId
                        );
                        return {
                            data: data?.items?.map(ct => ({ label: ct.name || 'No Name', value: ct.key || ct.id || '' })) || [],
                            isLoading
                        };
                    }
                }
            },
        },
        {
            name: "multiple",
            fieldType: "switch",
            label: "Is Multiple",
            fieldConfig: {
                defaultValue: true
            }
        }
    ],
    resolveProps: (properties, context) => {
        return {
            // Tạm thời fetch list content types để giả lập (mock) theo ý user
            useOptions: (search: string) => {
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const { data, isLoading } = useContentItems({
                    page: 1,
                    pageSize: 10,
                    globalKeyword: search
                }, { projectId: context?.projectId || '', contentTypeKey: properties?.targetContentType || '' })
                return {
                    data: data?.items?.map(item => ({ label: item.name || 'No Name', value: item.id || '' })) || [],
                    isLoading
                };
            }
        };
    }
});
