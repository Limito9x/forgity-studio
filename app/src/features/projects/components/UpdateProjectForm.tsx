import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { updateProjectSchema, type UpdateProjectInput, type UpdateProjectOutput } from "../schemas/updateProjectSchema";
import { useTranslation } from "react-i18next";
import { useGetProjectById } from "../hooks/useProjects";

interface ProjectFormProps {
    id: string;
    onSubmit: (data: UpdateProjectOutput) => void;
}

export function UpdateProjectForm({ id, onSubmit }: ProjectFormProps) {
    const { t } = useTranslation("projects");
    const { data: project } = useGetProjectById(id);

    const form = useForm<UpdateProjectInput, any, UpdateProjectOutput>({
        resolver: zodResolver(updateProjectSchema),
        values: project ? {
            name: project.name || "",
            slug: project.slug || "",
        } : undefined,
        defaultValues: {
            name: "",
            slug: "",
        }
    });

    return (
        <Form form={form} formId={`update-project-form-${id}`} onSubmit={onSubmit}>
            <FormGrid cols={1}>
                <FormInput
                    control={form.control}
                    label={t("fields.name", { defaultValue: "Name" })}
                    name="name"
                    type="text"
                    placeholder="Enter project name"
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

