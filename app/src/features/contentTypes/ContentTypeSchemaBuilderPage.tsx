import { useGetContentType, useUpdateContentTypeSchema } from "./hooks/useContentTypes";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Form, useForm, zodResolver } from "@/components/form";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { z } from "zod";
import { FormBuilder } from "./components/FormBuilder";
import { Loader2 } from "lucide-react";
import { fieldDefinitionSchema } from "./schemas/createContentTypeSchema";
import { useGetProjectStructs } from "@/features/structs/hooks/useStructs";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

const schemaConfigSchema = z.object({
    fieldsConfig: z.array(fieldDefinitionSchema).default([]),
});

type SchemaConfigInput = z.input<typeof schemaConfigSchema>;

export function ContentTypeSchemaBuilderPage({ projectId, contentTypeId }: { projectId: string, contentTypeId: string }) {
    const { t } = useTranslation("contentTypes");
    const nav = useProjectNav({ projectId });

    const { data: contentType, isLoading } = useGetContentType(projectId, contentTypeId);
    const { data: structs } = useGetProjectStructs(projectId);

    const { mutate: updateSchema, isPending } = useUpdateContentTypeSchema({ projectId });

    const form = useForm<SchemaConfigInput>({
        resolver: zodResolver(schemaConfigSchema),
        defaultValues: {
            fieldsConfig: (contentType?.fieldsConfig as any) || [],
        }
    });

    useEffect(() => {
        if (contentType && form.getValues().fieldsConfig?.length === 0 && (contentType.fieldsConfig as any[])?.length > 0) {
            form.reset({ fieldsConfig: contentType.fieldsConfig as any });
        }
    }, [contentType, form]);

    const onSubmit = (data: SchemaConfigInput) => {
        updateSchema(
            { id: contentTypeId, data: { fieldsConfig: data.fieldsConfig } },
            {
                onSuccess: () => {
                    toast.success(t("messages.schemaUpdateSuccess", { defaultValue: "Schema updated successfully" }));
                    nav.toContentTypes();
                },
                onError: (error: any) => {
                    toast.error(error?.message || "Failed to update schema");
                }
            }
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (!contentType) {
        return <div>Not found</div>;
    }

    return (
        <div className="flex flex-col h-full gap-2">
            <div className="flex flex-col gap-1 px-4 md:px-6 lg:px-8 pt-4 pb-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => nav.toContentTypes()}
                        className="hover:underline cursor-pointer bg-transparent border-0 p-0 text-muted-foreground"
                    >
                        &larr; {t("common:back", { defaultValue: "Back to Content Types" })}
                    </button>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                    {t("page.schemaBuilderTitle", { defaultValue: `Schema Builder: ${contentType.displayName || contentType.name}` })}
                </h1>
                <p className="text-muted-foreground text-sm">
                    {t("page.schemaBuilderDescription", { defaultValue: "Configure fields for this content type" })}
                </p>
            </div>

            <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 py-2">
                <Form form={form} formId="schema-builder-form" onSubmit={onSubmit}>
                    <FormBuilder builderContext={{ projectId, structs }} />

                    <div className="flex justify-end mt-4 mb-6">
                        <Button type="button" variant="outline" className="mr-2" onClick={() => nav.toContentTypes()}>
                            {t("common:cancel", { defaultValue: "Cancel" })}
                        </Button>
                        <Button type="submit" isDisabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {t("common:save", { defaultValue: "Save Changes" })}
                        </Button>
                    </div>
                </Form>
            </div>
        </div>
    );
}
