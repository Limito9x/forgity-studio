import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { updateUserSchema, type UpdateUserValues } from "../schemas/updateUserSchema";
import { useGetUserById } from "../hooks/useUsers";
import { useTranslation } from "react-i18next";

interface UpdateUserFormProps {
    id: string;
    onSubmit: (data: UpdateUserValues) => void;
}

export function UpdateUserForm({ id, onSubmit }: UpdateUserFormProps) {
    const { t } = useTranslation("users");
    const { data: user } = useGetUserById(id);

    const form = useForm<UpdateUserValues, any, UpdateUserValues>({
        resolver: zodResolver(updateUserSchema),
        values: user ? {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            displayName: user.displayName || "",
            phoneNumber: user.phoneNumber || "",
        } : undefined,
        defaultValues: {
            firstName: "",
            lastName: "",
            displayName: "",
            phoneNumber: "",
        }
    });

    return (
        <Form<UpdateUserValues, UpdateUserValues> form={form} formId={`update-user-form-${id}`} onSubmit={onSubmit}>
            <FormGrid cols={2}>
                <FormInput control={form.control} name="firstName" label={t("fields.firstName", { defaultValue: "First Name" })} />
                <FormInput control={form.control} name="lastName" label={t("fields.lastName", { defaultValue: "Last Name" })} />
                <FormInput control={form.control} name="displayName" label={t("fields.displayName", { defaultValue: "Display Name" })} />
                <FormInput control={form.control} name="phoneNumber" label={t("fields.phoneNumber", { defaultValue: "Phone Number" })} />
            </FormGrid>
        </Form>
    );
}