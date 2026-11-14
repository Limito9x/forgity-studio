import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { BaseFormField } from "./BaseFormField";
import { Input } from "../ui/input";
import type { BaseFormControlProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";

export interface FormColorPickerProps<T extends FieldValues>
    extends BaseFormControlProps<T> {
    className?: string;
    disabled?: boolean;
}

export function FormColorPicker<T extends FieldValues>({
    className,
    disabled,
    ...rest
}: FormColorPickerProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 overflow-hidden rounded-md border shadow-sm shrink-0">
                        <input
                            type="color"
                            id={field.field_id}
                            name={field.input_name}
                            value={field.value || "#000000"}
                            onChange={field.onChange}
                            disabled={disabled}
                            className={cn("absolute -top-2 -left-2 w-14 h-14 cursor-pointer", className)}
                        />
                    </div>
                    <Input
                        type="text"
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="#000000"
                        disabled={disabled}
                        className="font-mono"
                    />
                </div>
            )}
        />
    );
}


export interface FormColorPickerProperties {
    required?: boolean;
    requiredMsg?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "color": {
            properties: FormColorPickerProperties,
            defaultValue: string
        }
    }
}
registerField({
    type: "color",
    component: FormColorPicker,
    buildSchema: (p: FormColorPickerProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        let s = z.string({ message: reqMsg });
        if (p.required) s = s.min(1, reqMsg);
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: []
});
