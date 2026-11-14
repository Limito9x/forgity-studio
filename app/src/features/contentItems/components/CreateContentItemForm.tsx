import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput } from "@/components/form-controls";
import { createContentItemSchema, type CreateContentItemInput, type CreateContentItemOutput } from "../schemas/createContentItemSchema";
import { useTranslation } from "react-i18next";

interface ContentItemFormProps {
    onSubmit: (data: CreateContentItemOutput) => void;
}

export function CreateContentItemForm({ onSubmit }: ContentItemFormProps) {
    const { t } = useTranslation("contentItems");
    const form = useForm<CreateContentItemInput, any, CreateContentItemOutput>({
        resolver: zodResolver(createContentItemSchema),
        defaultValues: {
            name: "",
        }
    });

    return (
        <Form form={form} formId={"create-content-item-form"} onSubmit={onSubmit}>
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
