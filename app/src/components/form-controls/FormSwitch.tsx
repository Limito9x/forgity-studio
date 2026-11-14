import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { Switch } from "../ui/switch";
import type { BaseFormControlProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "./BaseFormField";

export interface FormSwitchProps<T extends FieldValues>
    extends BaseFormControlProps<T> {
    className?: string;
    disabled?: boolean;
}

export function FormSwitch<T extends FieldValues>({
    className,
    disabled,
    ...rest
}: FormSwitchProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={(field) => (
                <div>
                    <Switch
                        id={field.field_id}
                        name={field.input_name}
                        isSelected={!!field.value}
                        onChange={field.onChange}
                        isDisabled={disabled}
                        className={className}
                    />
                </div>
            )}
        />
    );
}


export interface FormSwitchProperties {
    required?: boolean;
    requiredMsg?: string;
    disabled?: boolean;
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "switch": {
            properties: FormSwitchProperties,
            defaultValue: boolean
        }
    }
}
registerField({
    type: "switch",
    component: FormSwitch,
    buildSchema: (p: FormSwitchProperties) => {
        let s = z.boolean();
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: []
});
