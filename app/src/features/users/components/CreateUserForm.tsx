import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormApiCombobox, FormInput } from "@/components/form-controls";
import { type CreateUserDetailInput, type CreateUserDetailOutput, useCreateUserDetailSchema } from "@/features/users/schemas/createUserSchema";
import { useRoleOptions } from "@/features/roles/hooks/useRoles";
import { useTranslation } from "react-i18next";

interface UserFormProps {
    onSubmit: (data: CreateUserDetailOutput) => void;
}

export function CreateUserForm({ onSubmit }: UserFormProps) {
    const { t } = useTranslation("users");
    const createUserSchema = useCreateUserDetailSchema();
    const form = useForm<CreateUserDetailInput, any, CreateUserDetailOutput>({
        resolver: zodResolver(createUserSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            roleId: ""
        }
    });

    return (
        <Form form={form} formId={"create-user-form"} onSubmit={onSubmit}>
            <FormGrid cols={2}>
                <FormInput
                    control={form.control}
                    label={t("fields.firstName", { defaultValue: "First Name" })}
                    name="firstName"
                    type="text"
                    placeholder={t("placeholders.firstName", { defaultValue: "John" })}
                />
                <FormInput
                    control={form.control}
                    label={t("fields.lastName", { defaultValue: "Last Name" })}
                    name="lastName"
                    type="text"
                    placeholder={t("placeholders.lastName", { defaultValue: "Doe" })}
                />
                <FormInput
                    control={form.control}
                    label={t("fields.email", { defaultValue: "Email" })}
                    name="email"
                    type="email"
                    placeholder={t("placeholders.email", { defaultValue: "email@example.com" })}
                />
                <FormApiCombobox
                    control={form.control}
                    label={t("fields.roleId", { defaultValue: "Role" })}
                    name="roleId"
                    placeholder={t("placeholders.roleId", { defaultValue: "Select a role" })}
                    useOptions={useRoleOptions}
                    getItemValue={(item) => item.value}
                />
            </FormGrid>

        </Form>
    )
}