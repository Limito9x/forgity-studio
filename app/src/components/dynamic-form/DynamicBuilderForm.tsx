import { DynamicForm } from "./DynamicForm";
import { getFieldRegistration, type FieldDefinition } from "@/lib/field-registry";

interface DynamicBuilderFormProps {
    /** The registered field type (e.g., 'text', 'select') */
    type: string;
    defaultValues?: Record<string, any>;
    onSubmit: (values: Record<string, any>) => void;
    submitText?: string;
}

export function DynamicBuilderForm({
    type,
    defaultValues = {},
    onSubmit,
    submitText = "Lưu cấu hình"
}: DynamicBuilderFormProps) {
    const registration = getFieldRegistration(type);

    const baseFields: FieldDefinition<any>[] = [
        {
            name: "name",
            type: "text",
            label: "Field ID (Name)",
            config: {
                placeholder: "Leave empty to auto-generate from label"
            }
        },
        {
            name: "label",
            type: "text",
            label: "Display Label",
            properties: {
                required: true
            }
        },
        {
            name: "description",
            type: "textarea",
            label: "Description"
        },
        {
            name: "properties.required",
            type: "switch",
            label: "Required field?"
        }
    ];

    const combinedFields = [
        ...baseFields,
        ...((registration?.builderFields || []) as any)
    ];

    return (
        <DynamicForm
            key={type} // Ép re-mount form và reset values khi type thay đổi
            defaultValues={defaultValues}
            fields={combinedFields}
            submitText={submitText}
            onSubmit={onSubmit}
        />
    );
}
