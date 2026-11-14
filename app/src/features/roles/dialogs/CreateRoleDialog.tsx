import { CreateRoleForm } from "../components/CreateRoleForm";
import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useCreateRole } from "../hooks/useRoles";

export function CreateRoleDialog({ open, onOpenChange }: DialogProps<undefined>) {
    const { t } = useTranslation("role");
    const createRole = useCreateRole();
    const isPending = createRole.isPending;

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.create", { defaultValue: "Create Role" })}
            formId="create-role-form"
            isPending={isPending}
            size="md"
        >
            <CreateRoleForm
                onSubmit={(values) => {
                    createRole.mutate({ data: values }, {
                        onSuccess: () => onOpenChange(false)
                    });
                }}
            />
        </BaseFormDialog>
    );
}
