import { useGetStructById, useGetProjectStructs, useUpdateStruct } from "./hooks/useStructs";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Form, useForm, zodResolver } from "@/components/form";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { z } from "zod";
import { FormBuilder } from "@/features/contentTypes/components/FormBuilder";
import { Loader2, Boxes } from "lucide-react";
import { fieldDefinitionSchema } from "@/features/contentTypes/schemas/createContentTypeSchema";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

const schemaConfigSchema = z.object({
    fieldsConfig: z.array(fieldDefinitionSchema).default([]),
});

type SchemaConfigInput = z.input<typeof schemaConfigSchema>;

import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

interface StructSchemaBuilderPageProps {
    projectId: string;
    structId: string;
}

export function StructSchemaBuilderPage({ projectId, structId }: StructSchemaBuilderPageProps) {
    const { t } = useTranslation("structs");
    const { studioSlug } = useCurrentStudio();
    const nav = useProjectNav({ studioSlug, projectId });

    const { data: structDetail, isLoading } = useGetStructById(projectId, structId);
    const { data: structs } = useGetProjectStructs(projectId);
    const { mutate: updateStruct, isPending } = useUpdateStruct({ projectId });

    const form = useForm<SchemaConfigInput>({
        resolver: zodResolver(schemaConfigSchema),
        defaultValues: {
            fieldsConfig: (structDetail?.activeVersion?.fields as any) || [],
        }
    });

    useEffect(() => {
        if (structDetail?.activeVersion?.fields) {
            const rawFields = structDetail.activeVersion.fields;
            if (Array.isArray(rawFields) && rawFields.length > 0) {
                form.reset({ fieldsConfig: rawFields });
            }
        }
    }, [structDetail, form]);

    const onSubmit = (data: SchemaConfigInput) => {
        if (!structDetail) return;

        updateStruct(
            {
                projectId,
                id: structId,
                data: {
                    name: structDetail.name || "",
                    fields: data.fieldsConfig as any
                }
            },
            {
                onSuccess: () => {
                    toast.success(t("messages.schemaUpdateSuccess", { defaultValue: "Struct schema updated successfully" }));
                    nav.toStructs();
                },
                onError: (error: any) => {
                    const message = error?.message || error?.response?.data?.message || "Failed to update struct schema";
                    toast.error(message, {
                        duration: 6000
                    });
                }
            }
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!structDetail) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                Struct not found or has been deleted.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full gap-2">
            <div className="flex flex-col gap-1 px-4 md:px-6 lg:px-8 pt-4 pb-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Link
                        to={nav.urls.structs()}
                        className="hover:underline flex items-center gap-1"
                    >
                        &larr; {t("common:back", { defaultValue: "Back to Structs" })}
                    </Link>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                        <Boxes className="w-5 h-5" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {t("page.schemaBuilderTitle", { defaultValue: `Struct Builder: ${structDetail.name}` })}
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm">
                    {t("page.schemaBuilderDescription", { defaultValue: "Define attributes and nested types for this composite data model." })}
                </p>
            </div>

            <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 py-2">
                <Form form={form} formId="struct-schema-builder-form" onSubmit={onSubmit}>
                    <FormBuilder
                        builderContext={{
                            projectId,
                            currentStructId: structId,
                            structs: structs || []
                        }}
                    />

                    <div className="flex justify-end mt-4 mb-6">
                        <Button
                            type="button"
                            variant="outline"
                            className="mr-2"
                            onPress={() => nav.toStructs()}
                        >
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
