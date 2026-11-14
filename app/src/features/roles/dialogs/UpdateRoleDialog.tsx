import { UpdateRoleForm } from "../components/UpdateRoleForm";
import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useUpdateRole } from "../hooks/useRoles";

export function UpdateRoleDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation("role");
    const updateRole = useUpdateRole();

    if (!data?.id) return null;

    const handleSubmit = (values: any) => {
        updateRole.mutate({ id: data.id, data: values }, {
            onSuccess: () => onOpenChange(false)
        });
    };

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.update", { defaultValue: "Update Role" })}
            formId={`update-role-form-${data.id}`}
            isPending={updateRole.isPending}
            size="md"
        >
            <UpdateRoleForm
                id={data.id}
                onSubmit={handleSubmit}
            />
        </BaseFormDialog>
    );
}
