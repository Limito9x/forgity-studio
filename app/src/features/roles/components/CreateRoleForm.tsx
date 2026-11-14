import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { createRoleSchema, type CreateRoleInput, type CreateRoleOutput } from "../schemas/createRoleSchema";
import { useTranslation } from "react-i18next";

interface RoleFormProps {
    onSubmit: (data: CreateRoleOutput) => void;
}

export function CreateRoleForm({ onSubmit }: RoleFormProps) {
    const { t } = useTranslation("role");
    const form = useForm<CreateRoleInput, any, CreateRoleOutput>({
        resolver: zodResolver(createRoleSchema),
        defaultValues: {
            name: "",
        }
    });

    return (
        <Form form={form} formId={"create-role-form"} onSubmit={onSubmit}>
            <FormGrid cols={1}>
                <FormInput
                    control={form.control}
                    label={t("fields.name", { defaultValue: "Name" })}
                    name="name"
                    type="text"
                    placeholder="Enter name"
                />
            </FormGrid>
        </Form>
    );
}
