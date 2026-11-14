import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormTextarea, FormIconPicker, FormSelect } from "@/components/form-controls";
import { createContentTypeSchema, type CreateContentTypeInput, type CreateContentTypeOutput } from "../schemas/createContentTypeSchema";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

interface ContentTypeFormProps {
    onSubmit: (data: CreateContentTypeOutput) => void;
    projectId: string;
}

export function CreateContentTypeForm({ onSubmit, projectId }: ContentTypeFormProps) {
    const { t } = useTranslation("contentTypes");
    const form = useForm<CreateContentTypeInput, any, CreateContentTypeOutput>({
        resolver: zodResolver(createContentTypeSchema),
        defaultValues: {
            projectId: projectId,
            name: "",
            displayName: "",
            description: "",
            icon: "",
            color: "",
            sortOrder: 0,
            displayConfig: { mode: "table" },
        }
    });

    const nameValue = form.watch("name");

    useEffect(() => {
        if (nameValue) {
            form.setValue("displayName", nameValue, { shouldValidate: true });
        }
    }, [nameValue, form]);

    return (
        <Form form={form} formId={"create-content-type-form"} onSubmit={onSubmit}>
            <FormGrid cols={2}>
                <FormInput
                    control={form.control}
                    label={t("fields.name", { defaultValue: "Name" })}
                    name="name"
                    type="text"
                    placeholder="Enter name (e.g. Blog Post)"
                />
                <FormIconPicker
                    control={form.control}
                    label={t("fields.icon", { defaultValue: "Icon (optional)" })}
                    name="icon"
                />
            </FormGrid>
            <div className="mt-4">
                <FormTextarea
                    control={form.control}
                    label={t("fields.description", { defaultValue: "Description" })}
                    name="description"
                    placeholder="Describe this content type..."
                />
                <FormSelect
                    control={form.control}
                    label="Display Mode"
                    name="displayConfig.mode"
                    options={[
                        { label: "Table", value: "table" },
                        { label: "List Card", value: "list-card" }
                    ]}
                />
            </div>
        </Form>
    );
}
