import { DynamicField } from "./DynamicField";
import type { Control, FieldValues } from "react-hook-form";
import type { FieldDefinition, ScopedFieldRegistry } from "@/lib/field-registry";

export interface FormRendererProps<T extends FieldValues = any> {
    control: Control<T>;
    fields: FieldDefinition<T>[];
    context?: Record<string, any>;
    registry?: ScopedFieldRegistry;
    namePrefix?: string;
}

export function FormRenderer<T extends FieldValues>({
    control,
    fields,
    context,
    registry,
    namePrefix,
}: FormRendererProps<T>) {
    return (
        <div className="space-y-4">
            {fields.map((field) => {
                const prefixedField = namePrefix
                    ? { ...field, name: `${namePrefix}.${field.name as string}` }
                    : field;
                return (
                    <DynamicField
                        key={prefixedField.name}
                        control={control}
                        field={prefixedField as any}
                        context={context}
                        registry={registry}
                    />
                );
            })}
        </div>
    );
}