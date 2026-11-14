import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGetSystemSettingById, useUpdateSystemSetting } from "../../hooks/useSystemSettings";
import type { DialogProps } from "@/lib/dialog-registry";
import { UpdateSettingsForm, type UpdateSystemSettingValues } from "./UpdateSettingsForm";

export function UpdateSystemSettingDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation("common");
    
    if (!data?.id) return null;

    const { data: setting } = useGetSystemSettingById(data.id);
    const { mutateAsync: updateSetting, isPending } = useUpdateSystemSetting();

    const handleSubmit = async (formData: UpdateSystemSettingValues) => {
        try {
            await updateSetting({ id: data.id, data: formData });
            toast.success("System setting updated successfully");
            onOpenChange(false);
        } catch (error) {
            // Error handling is done globally
        }
    };

    return (
        <BaseFormDialog
            title="Edit System Setting"
            description={`Update value for: ${setting?.key ?? "..."}`}
            open={open}
            onOpenChange={onOpenChange}
            formId={`update-settings-form-${data.id}`}
            isPending={isPending}
            submitText={t("actions.save", { defaultValue: "Save" })}
            size="md"
        >
            <UpdateSettingsForm
                id={data.id}
                onSubmit={handleSubmit}
                values={setting ? { value: setting.value } : undefined}
            />
        </BaseFormDialog>
    );
}
