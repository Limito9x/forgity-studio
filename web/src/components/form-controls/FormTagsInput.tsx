import { BaseFormField } from "./BaseFormField";
import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { TagsInput, type TagsInputProps } from "@/components/custom-ui/inputs/tags-input/TagsInput";

export interface FormTagsInputProps<T extends FieldValues>
    extends BaseFormControlProps<T>,
    OmitFormProps<Omit<TagsInputProps, "value" | "onChange">> {
    transformTag?: (tag: string) => string;
    renderTagLabel?: (tag: string) => React.ReactNode;
}

export function FormTagsInput<T extends FieldValues>({
    disabled,
    transformTag,
    renderTagLabel,
    ...rest
}: FormTagsInputProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={({ value, onChange, ref, ...fieldProps }) => (
                <TagsInput
                    {...fieldProps}
                    ref={ref}
                    value={value || []}
                    onChange={onChange}
                    disabled={disabled}
                    transformTag={transformTag}
                    renderTagLabel={renderTagLabel}
                    id={rest.id}
                />
            )}
        />
    );
}

export interface FormTagsProperties {
    required?: boolean;
    requiredMsg?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "tags": {
            properties: FormTagsProperties,
            defaultValue: string[]
        }
    }
}
registerField({
    type: "tags",
    component: FormTagsInput,
    buildSchema: (p: FormTagsProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.array(z.string(), { message: reqMsg });
        if (p.required) s = s.min(1, reqMsg);
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: []
});
