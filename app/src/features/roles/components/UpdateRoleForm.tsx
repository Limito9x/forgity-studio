import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { updateRoleSchema, type UpdateRoleInput, type UpdateRoleOutput } from "../schemas/updateRoleSchema";
import { useTranslation } from "react-i18next";
import { useRole } from "../hooks/useRoles";

interface RoleFormProps {
    id: string;
    onSubmit: (data: UpdateRoleOutput) => void;
}

export function UpdateRoleForm({ id, onSubmit }: RoleFormProps) {
    const { t } = useTranslation("role");

    const { data: role } = useRole(id);

    const form = useForm<UpdateRoleInput, any, UpdateRoleOutput>({
        resolver: zodResolver(updateRoleSchema),
        values: role ? {
            name: role.name || "",
        } : undefined,
        defaultValues: {
            name: "",
        }
    });

    return (
        <Form form={form} formId={`update-role-form-${id}`} onSubmit={onSubmit}>
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
