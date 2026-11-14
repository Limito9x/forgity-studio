import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import { BaseFormField } from "./BaseFormField";
import type { BaseFormControlProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStructDependencies } from "@/components/dynamic-form/StructDependenciesContext";
import { findStructDependency, extractChildFields } from "./struct/struct-utils";
import { FormStructSingle } from "./struct/FormStructSingle";
import { FormStructArray } from "./struct/FormStructArray";
import { FormStructMap } from "./struct/FormStructMap";

export interface FormStructProperties {
    required?: boolean;
    requiredMsg?: string;
    structId?: string;
    structName?: string;
    cardinality?: "single" | "array" | "map";
}

export interface FormStructFieldProps<T extends FieldValues>
    extends BaseFormControlProps<T> {
    properties?: FormStructProperties;
    context?: Record<string, any>;
}

export function FormStructField<T extends FieldValues>({
    properties,
    control,
    name,
    label,
    description,
    isRequired,
    context,
    ...rest
}: FormStructFieldProps<T>) {
    const dependencies = useStructDependencies();
    const structId = properties?.structId;
    const cardinality = properties?.cardinality || "single";

    const dep = findStructDependency(dependencies, structId);
    const childFields = extractChildFields(dep);

    // Nếu đã nạp dependencies và có cấu hình fields con => render form runtime tương ứng
    if (childFields.length > 0) {
        if (cardinality === "array") {
            return (
                <FormStructArray
                    control={control as any}
                    name={name}
                    label={label}
                    description={description}
                    structName={properties?.structName || dep?.name}
                    childFields={childFields}
                    context={context}
                    isRequired={isRequired}
                />
            );
        }

        if (cardinality === "map") {
            return (
                <FormStructMap
                    control={control as any}
                    name={name}
                    label={label}
                    description={description}
                    structName={properties?.structName || dep?.name}
                    childFields={childFields}
                    context={context}
                    isRequired={isRequired}
                />
            );
        }

        return (
            <FormStructSingle
                control={control as any}
                name={name}
                label={label}
                description={description}
                structName={properties?.structName || dep?.name}
                childFields={childFields}
                context={context}
                isRequired={isRequired}
            />
        );
    }

    // Nếu chưa có dependencies hoặc ở chế độ preview trong FormBuilder Canvas => render badge
    return (
        <BaseFormField
            control={control}
            name={name}
            label={label}
            description={description}
            isRequired={isRequired}
            {...rest}
            render={() => (
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
                    <Boxes className="w-4 h-4 text-primary" />
                    <span>Struct Target:</span>
                    <Badge variant="outline" className="font-mono text-xs">
                        {properties?.structName || properties?.structId || "Unconfigured"}
                    </Badge>
                    <Badge variant="secondary" className="text-xs capitalize">
                        {cardinality}
                    </Badge>
                </div>
            )}
        />
    );
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "struct": {
            properties: FormStructProperties;
            defaultValue: any;
        };
    }
}

registerField({
    type: "struct",
    component: FormStructField,
    buildSchema: (p: FormStructProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || 'This field'} is required`;
        if (p.required) {
            return z.any().refine(val => val !== undefined && val !== null, { message: reqMsg });
        }
        return z.any().optional().nullable();
    },
    builderFields: [
        {
            name: "structId",
            fieldType: "select",
            label: "Target Struct",
            isRequired: true,
            resolverFieldConfig: (builderContext?: Record<string, any>) => {
                const structs = (builderContext?.structs as Array<{ id: string; name: string }>) || [];
                const currentStructId = builderContext?.currentStructId;

                // Lọc bỏ chính struct hiện tại để ngăn self-reference ngay từ giao diện
                const filtered = structs.filter(s => s.id !== currentStructId);

                return {
                    placeholder: "Select a struct...",
                    options: filtered.map(s => ({
                        label: s.name,
                        value: s.id
                    }))
                };
            }
        },
        {
            name: "cardinality",
            fieldType: "select",
            label: "Cardinality",
            isRequired: true,
            fieldConfig: {
                placeholder: "Select cardinality...",
                options: [
                    { label: "Single (1 struct con)", value: "single" },
                    { label: "Array (Danh sách structs)", value: "array" },
                    { label: "Map (Từ điển Key-Value)", value: "map" }
                ]
            }
        }
    ]
});
