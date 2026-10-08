import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { BaseFormField } from "./BaseFormField";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";

// Derive Select props directly from the component — no phantom types
type SelectRootProps = React.ComponentProps<typeof Select>;

// ─── Shared option shape ──────────────────────────────────────────────────────
// Mirrors backend OptionItem { value: string, label: string }
export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

// ─── FormSelect (static options) ─────────────────────────────────────────────
export interface FormSelectProps<T extends FieldValues>
    extends BaseFormControlProps<T>,
    OmitFormProps<Omit<SelectRootProps, "autoComplete" | "className">> {
    options: (SelectOption | string)[];
}

export function FormSelect<T extends FieldValues>({ options = [], ...rest }: FormSelectProps<T>) {
    // Cho phép options vừa là string[] (từ tags builder) vừa là object[]
    const normalizedOptions = options.map(opt =>
        typeof opt === "string" ? { label: opt, value: opt } : opt
    );

    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <Select
                    selectedKey={field.value?.toString() || null}
                    onSelectionChange={field.onChange}
                    isDisabled={field.disabled}
                    className="w-full"
                >
                    <SelectTrigger id={field.field_id}>
                        <SelectValue>
                            {({ selectedText }) => selectedText || rest.placeholder}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {normalizedOptions.length > 0 ? (
                            normalizedOptions.map((option) => (
                                <SelectItem
                                    key={option.value}
                                    id={option.value}
                                    isDisabled={option.disabled}
                                >
                                    {option.label}
                                </SelectItem>
                            ))
                        ) : (
                            <SelectItem id="__empty__" isDisabled className="text-muted-foreground italic text-xs">
                                No available options
                            </SelectItem>
                        )}
                    </SelectContent>
                </Select>
            )}
        />
    );
}


export interface FormSelectProperties {
    required?: boolean;
    requiredMsg?: string;
    placeholder?: string;
    disabled?: boolean;
    options?: (SelectOption | string)[];
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "select": {
            properties: FormSelectProperties,
            defaultValue: string
        }
    }
}
registerField({
    type: "select",
    component: FormSelect,
    buildSchema: (p: FormSelectProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
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
            name: "options",
            fieldType: "tags",
            label: "Options",
            fieldConfig: {
                placeholder: "Add options",
            },
            isRequired: true,
        }
    ]
});
