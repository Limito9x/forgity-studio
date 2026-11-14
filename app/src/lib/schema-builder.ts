import { z } from "zod";
import type { FieldDefinition, ScopedFieldRegistry } from "./field-registry";
import { getFieldRegistration } from "./field-registry";

export interface BuildDynamicSchemaOptions {
    registry?: ScopedFieldRegistry;
    dependencies?: Record<string, any>;
}

function extractFieldsFromDependency(dep: any): FieldDefinition<any, any>[] {
    if (!dep) return [];
    const fields = dep.fieldsConfig ?? dep.fields;
    if (Array.isArray(fields)) return fields;
    if (typeof fields === "string") {
        try {
            const parsed = JSON.parse(fields);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * Quét qua mảng FieldDefinition JSON và tự động gọi các hàm buildSchema
 * do từng Component định nghĩa để sinh ra Zod Schema hoàn chỉnh.
 * Hỗ trợ ScopedFieldRegistry và đệ quy lồng nhau cho Structs (single, array, map) qua dependencies.
 */
export function buildDynamicSchema(
    fields: FieldDefinition<any, any>[],
    registryOrOptions?: ScopedFieldRegistry | BuildDynamicSchemaOptions,
    maybeDependencies?: Record<string, any>
): z.ZodObject<any> {
    let registry: ScopedFieldRegistry | undefined;
    let dependencies: Record<string, any> | undefined;

    if (registryOrOptions && "get" in registryOrOptions && typeof registryOrOptions.get === "function") {
        registry = registryOrOptions as ScopedFieldRegistry;
        dependencies = maybeDependencies;
    } else if (registryOrOptions) {
        const options = registryOrOptions as BuildDynamicSchemaOptions;
        registry = options.registry;
        dependencies = options.dependencies;
    }

    const shape: Record<string, z.ZodTypeAny> = {};

    for (const field of fields) {
        const isReq =
            field.properties?.required === true ||
            field.rules?.required === true;

        const reqMsg = `${field.label || field.name} is required`;

        // Xử lý đệ quy cho loại trường struct nếu có dependencies
        if (field.type === "struct") {
            const structId = field.properties?.structId;
            const cardinality = field.properties?.cardinality || "single";

            let dep: any = undefined;
            if (structId && dependencies) {
                dep = dependencies[structId] ||
                    Object.entries(dependencies).find(
                        ([k]) => k.toLowerCase() === structId.toLowerCase()
                    )?.[1];
            }

            const childFields = extractFieldsFromDependency(dep);

            if (childFields.length > 0) {
                const childSchema = buildDynamicSchema(childFields, { registry, dependencies });

                let structFieldSchema: z.ZodTypeAny;
                if (cardinality === "array") {
                    const arrSchema = z.array(childSchema);
                    structFieldSchema = isReq ? arrSchema.min(1, reqMsg) : arrSchema.default([]);
                } else if (cardinality === "map") {
                    const mapSchema = z.record(z.string(), childSchema);
                    structFieldSchema = isReq
                        ? mapSchema.refine((v) => Object.keys(v || {}).length > 0, { message: reqMsg })
                        : mapSchema.default({});
                } else {
                    structFieldSchema = isReq ? childSchema : childSchema.optional().nullable();
                }

                shape[field.name as string] = structFieldSchema;
                continue;
            }
        }

        const registration = registry
            ? registry.get(field.type as string)
            : getFieldRegistration(field.type as string);

        if (registration?.isAvailable === false) {
            shape[field.name as string] = z.any().optional().nullable();
            continue;
        }

        let fieldSchema: z.ZodTypeAny;

        if (registration?.buildSchema) {
            const props = field.properties;
            fieldSchema = registration.buildSchema(props as any, field);
        } else {
            // Fallback an toàn nếu Component quên không khai báo buildSchema
            if (isReq) {
                fieldSchema = z.any().refine(
                    (val) =>
                        val !== undefined &&
                        val !== null &&
                        val !== "" &&
                        (!Array.isArray(val) || val.length > 0),
                    { message: reqMsg }
                );
            } else {
                fieldSchema = z.any().optional().nullable();
            }
        }

        shape[field.name as string] = fieldSchema;
    }

    return z.object(shape);
}
