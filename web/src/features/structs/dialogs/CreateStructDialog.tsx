import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import { Form, useForm, zodResolver } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import type { DialogProps } from "@/lib/dialog-registry";
import { useTranslation } from "react-i18next";
import { useCreateStruct } from "../hooks/useStructs";
import { createStructSchema, type CreateStructInput } from "../schemas/createStructSchema";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

export function CreateStructDialog({ open, onOpenChange, data }: DialogProps<{ projectId: string }>) {
    const { t } = useTranslation("structs");
    const { studioSlug } = useCurrentStudio();
    const projectId = data?.projectId ?? "";
    const navigate = useNavigate();
    const createStruct = useCreateStruct({ projectId });

    const form = useForm<CreateStructInput>({
        resolver: zodResolver(createStructSchema),
        defaultValues: {
            name: "",
        }
    });

    if (!projectId) return null;

    const onSubmit = (values: CreateStructInput) => {
        createStruct.mutate(
            { projectId, data: { name: values.name } },
            {
                onSuccess: (createdStruct) => {
                    toast.success(t("messages.createSuccess", { defaultValue: `Struct '${values.name}' created successfully` }));
                    onOpenChange(false);
                    form.reset();
                    // Navigate directly to the schema builder for the new struct
                    navigate({
                        to: "/s/$studioSlug/projects/$projectId/structs/$structId/builder",
                        params: { studioSlug, projectId, structId: createdStruct.id || "" }
                    });
                },
                onError: (error: any) => {
                    toast.error(error?.message || "Failed to create struct");
                }
            }
        );
    };

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("actions.create", { defaultValue: "Create New Struct" })}
            description={t("dialogs.createDescription", { defaultValue: "Define a composite data structure that can be embedded into Content items and Pipeline visual scripting." })}
            formId="create-struct-form"
            isPending={createStruct.isPending}
            size="md"
        >
            <Form form={form} formId="create-struct-form" onSubmit={onSubmit}>
                <div className="space-y-4 py-2">
                    <FormInput
                        control={form.control}
                        name="name"
                        label={t("fields.name", { defaultValue: "Struct Name" })}
                        placeholder="e.g. TextureContract, SlotBinding, PlayerStats"
                        isRequired
                    />
                </div>
            </Form>
        </BaseFormDialog>
    );
}
