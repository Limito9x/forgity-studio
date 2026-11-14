import { getFieldRegistration } from "@/lib/field-registry";
import { FormRenderer } from "./FormRenderer";
import type { Control, FieldValues } from "react-hook-form";

interface BuilderConfigRendererProps<T extends FieldValues> {
    /** The registered field type (e.g., 'text', 'select') */
    type: string;
    control: Control<T>;
}

/**
 * Giống như DynamicField làm nhiệm vụ render 1 field cụ thể, 
 * BuilderConfigRenderer làm nhiệm vụ render ra dải cấu hình (builderFields) của 1 field cụ thể.
 * Lưu ý: Component này chỉ render các Form Controls, cần được bọc trong <Form> và truyền `control` từ `useForm`.
 */
export function BuilderConfigRenderer<T extends FieldValues>({
    type,
    control
}: BuilderConfigRendererProps<T>) {
    const registration = getFieldRegistration(type);

    if (registration?.isAvailable === false) {
        return null;
    }

    if (!registration?.builderFields || registration.builderFields.length === 0) {
        return (
            <div className="text-muted-foreground text-sm italic">
                Field "{type}" chưa được khai báo `builderFields` trong Registry.
            </div>
        );
    }

    return (
        <FormRenderer
            control={control}
            fields={registration.builderFields as any}
        />
    );
}
