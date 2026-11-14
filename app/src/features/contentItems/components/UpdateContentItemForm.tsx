import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { updateContentItemSchema, type UpdateContentItemInput, type UpdateContentItemOutput } from "../schemas/updateContentItemSchema";
import { useTranslation } from "react-i18next";
// import { useGetContentItemById } from "../hooks/useContentItems";

interface ContentItemFormProps {
    id: string;
    onSubmit: (data: UpdateContentItemOutput) => void;
}

export function UpdateContentItemForm({ id, onSubmit }: ContentItemFormProps) {
    const { t } = useTranslation("contentItems");
    
    // TODO: Bỏ comment khi API get by id khả dụng
    // const { data: contentItem } = useGetContentItemById(id);
    const contentItem: any = null;

    const form = useForm<UpdateContentItemInput, any, UpdateContentItemOutput>({
        resolver: zodResolver(updateContentItemSchema),
        values: contentItem ? {
            name: contentItem.name || "",
        } : undefined,
        defaultValues: {
            name: "",
        }
    });

    return (
        <Form form={form} formId={`update-content-item-form-${id}`} onSubmit={onSubmit}>
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
