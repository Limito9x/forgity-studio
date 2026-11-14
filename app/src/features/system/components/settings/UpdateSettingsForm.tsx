import { Form, useForm, z, zodResolver } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { useTranslation } from "react-i18next";

export const updateSystemSettingSchema = z.object({
    value: z.string().min(1, { message: "Value is required" }),
});

export type UpdateSystemSettingValues = z.infer<typeof updateSystemSettingSchema>;

interface UpdateSettingsFormProps {
    id: string;
    onSubmit: (data: UpdateSystemSettingValues) => void;
    values?: UpdateSystemSettingValues;
}

export function UpdateSettingsForm({ id, onSubmit, values }: UpdateSettingsFormProps) {
    const { t } = useTranslation("common");
    const form = useForm<UpdateSystemSettingValues>({
        resolver: zodResolver(updateSystemSettingSchema),
        values: values,
        defaultValues: {
            value: "",
        }
    });

    return (
        <Form form={form} formId={`update-settings-form-${id}`} onSubmit={onSubmit}>
            <FormInput 
                control={form.control} 
                name="value" 
                label={t("fields.value", { defaultValue: "Value" })} 
            />
        </Form>
    );
}