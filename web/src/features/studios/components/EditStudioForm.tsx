import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormTextarea } from "@/components/form-controls";
import {
  updateStudioSchema,
  type UpdateStudioInput,
  type UpdateStudioOutput,
} from "../schemas/updateStudioSchema";

interface EditStudioFormProps {
  formId: string;
  onSubmit: (data: UpdateStudioOutput) => void;
  defaultValues?: Partial<UpdateStudioInput>;
}

export function EditStudioForm({ formId, onSubmit, defaultValues }: EditStudioFormProps) {
  const form = useForm<UpdateStudioInput, any, UpdateStudioOutput>({
    resolver: zodResolver(updateStudioSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      description: defaultValues?.description || "",
    },
  });

  return (
    <Form form={form} formId={formId} onSubmit={onSubmit}>
      <FormGrid cols={1} className="gap-4">
        <FormInput
          control={form.control}
          label="Studio Name"
          name="name"
          type="text"
          placeholder="e.g. Acme VFX Studio"
        />
        <FormTextarea
          control={form.control}
          label="Description"
          name="description"
          placeholder="Brief description of your studio (optional)..."
          rows={3}
        />
      </FormGrid>
    </Form>
  );
}
