import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import { Form, useForm, zodResolver } from "@/components/form";
import { FormStaticCombobox } from "@/components/form-controls";
import { useGetUserById, useAssignUserRoles } from "../hooks/useUsers";
import { useRoleOptions } from "@/features/roles/hooks/useRoles";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAssignUserRolesSchema, type AssignUserRolesInput, type AssignUserRolesOutput } from "../schemas/assignUserRolesSchema";
import { useEffect } from "react";
import type { DialogProps } from "@/lib/dialog-registry";

export function AssignUserRolesDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation("users");
    const id = data?.id as string;
    
    const { data: user } = useGetUserById(id);
    const { data: roleOptions, isLoading: isRolesLoading } = useRoleOptions();
    const assignUserRoles = useAssignUserRoles();
    const schema = useAssignUserRolesSchema();

    const form = useForm<AssignUserRolesInput, any, AssignUserRolesOutput>({
        resolver: zodResolver(schema),
        defaultValues: {
            roles: []
        }
    });

    useEffect(() => {
        if (user) {
            form.reset({
                roles: user.roleIds || []
            });
        }
    }, [user, form]);

    const handleSubmit = async (formData: AssignUserRolesOutput) => {
        await assignUserRoles.mutateAsync(
            { id, data: { roles: formData.roles } },
            {
                onSuccess: () => {
                    toast.success(t("messages.assignRolesSuccess", { defaultValue: "User roles assigned successfully" }));
                    onOpenChange(false);
                },
                onError: (error: any) => {
                    toast.error(error?.response?.data?.message || t("messages.error", { defaultValue: "An error occurred" }));
                }
            }
        );
    };

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.assignRoles", { defaultValue: "Assign Roles" })}
            description={t("descriptions.assignRoles", { defaultValue: "Assign roles for this user." })}
            formId="assign-user-roles-form"
            isPending={assignUserRoles.isPending}
            size="md"
        >
            <Form form={form} formId="assign-user-roles-form" onSubmit={handleSubmit}>
                <FormStaticCombobox
                    control={form.control}
                    name="roles"
                    label={t("fields.roles", { defaultValue: "Roles" })}
                    options={roleOptions}
                    isLoading={isRolesLoading}
                    placeholder={t("placeholders.selectRoles", { defaultValue: "Select roles..." })}
                    multiple={true}
                />
            </Form>
        </BaseFormDialog>
    );
}
