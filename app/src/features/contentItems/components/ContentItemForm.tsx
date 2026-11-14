import { useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form } from "@/components/form/Form";
import { FormInput, FormImageUpload } from "@/components/form-controls";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { StructDependenciesProvider } from "@/components/dynamic-form/StructDependenciesContext";
import { buildDynamicSchema } from "@/lib/schema-builder";
import type { FieldDefinition } from "@/lib/field-registry";
import type { ContentTypeDto } from "@/gen/model";

export type ContentItemFormValues = Record<string, any>;

export interface ContentItemFormProps {
    formId: string;
    contentType: ContentTypeDto;
    initialData?: ContentItemFormValues;
    onSubmit: SubmitHandler<ContentItemFormValues>;
}

export function ContentItemForm({ formId, contentType, initialData, onSubmit }: ContentItemFormProps) {
    const { t } = useTranslation(["contentItems", "common"]);

    const dynamicFields = useMemo(() => {
        const fieldsConfig = contentType.fieldsConfig as any;
        return (fieldsConfig || []) as FieldDefinition<any>[];
    }, [contentType]);

    const dependencies = (contentType as any).dependencies || {};

    const schema = useMemo(() => {
        const dynamicSchema = buildDynamicSchema(dynamicFields, {
            dependencies,
        });
        const staticSchema = z.object({
            name: z.string().min(1, t("fields.nameRequired", { defaultValue: "Name is required" })),
            key: z.string().optional(),
            thumbnailAssetId: z.string().nullable().optional(),
        });

        return staticSchema.merge(dynamicSchema);
    }, [dynamicFields, dependencies, t]);

    const defaultValues = useMemo(() => {
        const defaults: Record<string, any> = {
            name: initialData?.name || "",
            key: initialData?.key || "",
            thumbnailAssetId: initialData?.thumbnailAssetId ?? null,
            ...((initialData || {}) as Record<string, any>),
        };

        dynamicFields.forEach(f => {
            if (f.defaultValue !== undefined && defaults[f.name as string] === undefined) {
                defaults[f.name as string] = f.defaultValue;
            } else if (f.type === "struct" && defaults[f.name as string] === undefined) {
                const cardinality = f.properties?.cardinality || "single";
                defaults[f.name as string] = cardinality === "array" ? [] : {};
            }
        });

        return defaults;
    }, [initialData, dynamicFields]);

    const form = useForm<ContentItemFormValues>({
        resolver: zodResolver(schema as any) as any,
        defaultValues,
        values: defaultValues, // Reactively update form values when async data finishes loading
    });

    useEffect(() => {
        if (initialData) {
            form.reset(defaultValues);
        }
    }, [initialData]);

    const formRendererContext = useMemo(() => ({
        projectId: contentType.projectId,
        resolvedData: (initialData as any)?.resolvedData,
    }), [contentType.projectId, initialData]);

    return (
        <Form form={form as any} onSubmit={onSubmit as any} formId={formId} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                    control={form.control}
                    name="name"
                    label={t("fields.name", { defaultValue: "Name" })}
                    placeholder={t("fields.namePlaceholder", { defaultValue: "Enter item name..." })}
                    required
                />
                <FormInput
                    control={form.control}
                    name="key"
                    label={t("fields.key", { defaultValue: "Key (Slug)" })}
                    placeholder={t("fields.keyPlaceholder", { defaultValue: "Auto-generated from Name if blank..." })}
                    description={t("fields.keyDescription", { defaultValue: "Unique semantic identifier within this content type" })}
                />
            </div>

            <FormImageUpload
                control={form.control as any}
                name="thumbnailAssetId"
                label={t("fields.thumbnail", { defaultValue: "Thumbnail Image" })}
                aspectRatio={16 / 9}
                cropShape="rect"
                defaultPreviewUrl={(initialData as any)?.thumbnailUrl}
            />

            {dynamicFields.length > 0 && (
                <StructDependenciesProvider dependencies={dependencies}>
                    <FormRenderer control={form.control} fields={dynamicFields} context={formRendererContext} />
                </StructDependenciesProvider>
            )}
        </Form>
    );
}
