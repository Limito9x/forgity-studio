import { useEffect } from "react";
import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { createProjectSchema, type CreateProjectInput, type CreateProjectOutput } from "../schemas/createProjectSchema";
import { useTranslation } from "react-i18next";

function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

interface ProjectFormProps {
    onSubmit: (data: CreateProjectOutput) => void;
}

export function CreateProjectForm({ onSubmit }: ProjectFormProps) {
    const { t } = useTranslation("projects");
    const form = useForm<CreateProjectInput, any, CreateProjectOutput>({
        resolver: zodResolver(createProjectSchema),
        defaultValues: {
            name: "",
            slug: "",
        }
    });

    const nameValue = form.watch("name");
    const slugTouched = form.formState.touchedFields.slug;

    useEffect(() => {
        if (!slugTouched && nameValue) {
            form.setValue("slug", slugify(nameValue), { shouldValidate: true });
        }
    }, [nameValue, slugTouched, form]);

    return (
        <Form form={form} formId={"create-project-form"} onSubmit={onSubmit}>
            <FormGrid cols={1}>
                <FormInput
                    control={form.control}
                    label={t("fields.name", { defaultValue: "Name" })}
                    name="name"
                    type="text"
                    placeholder="e.g. Project Eva"
                />
                <FormInput
                    control={form.control}
                    label={t("fields.slug", { defaultValue: "Slug" })}
                    name="slug"
                    type="text"
                    placeholder="e.g. project-eva"
                    description="Unique URL identifier for the project within this studio."
                />
            </FormGrid>
        </Form>
    );
}

