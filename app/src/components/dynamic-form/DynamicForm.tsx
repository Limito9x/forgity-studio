import { useForm, type DefaultValues, type FieldValues, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { Form } from "@/components/form/Form";
import { FormRenderer } from "./FormRenderer";
import type { FieldDefinition } from "@/lib/field-registry";
import { Button } from "@/components/ui/button";
import { buildDynamicSchema } from "@/lib/schema-builder";
import { useMemo } from "react";

export interface DynamicFormProps<T extends FieldValues> {
    /** Zod schema for form validation */
    schema?: ZodType<T>;
    /** Initial values for the form */
    defaultValues?: DefaultValues<T>;
    /** Array of field definitions */
    fields: FieldDefinition<T>[];
    /** Submit handler */
    onSubmit: SubmitHandler<T>;
    /** Text to display on the submit button */
    submitText?: string;
    formId?: string;
    context?: Record<string, any>;
    resolvedData?: Record<string, any>;
}

export function DynamicForm<T extends FieldValues>({
    schema,
    defaultValues,
    fields,
    onSubmit,
    submitText = "Lưu thông tin",
    formId,
    context,
    resolvedData,
}: DynamicFormProps<T>) {
    // Tự động sinh schema nếu không được truyền vào từ bên ngoài
    const finalSchema = useMemo(() => {
        if (schema) return schema;
        return buildDynamicSchema(fields) as unknown as ZodType<T>;
    }, [schema, fields]);

    const finalDefaultValues = useMemo(() => {
        const defaults = { ...defaultValues } as Record<string, any>;
        fields.forEach(f => {
            if (f.defaultValue !== undefined && defaults[f.name] === undefined) {
                defaults[f.name] = f.defaultValue;
            }
        });
        return defaults as any;
    }, [defaultValues, fields]);

    const combinedContext = useMemo(
        () => ({ ...context, resolvedData }),
        [context, resolvedData]
    );

    const form = useForm<T>({
        resolver: zodResolver(finalSchema as any) as any,
        defaultValues: finalDefaultValues,
    });

    return (
        <Form form={form as any} onSubmit={onSubmit as any} formId={formId}>
            <FormRenderer control={form.control} fields={fields} context={combinedContext} />
            <div className="flex justify-end mt-4">
                <Button type="submit">
                    {submitText}
                </Button>
            </div>
        </Form>
    );
}
