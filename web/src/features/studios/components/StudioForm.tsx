import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormTextarea } from "@/components/form-controls";
import {
  createStudioSchema,
  type CreateStudioInput,
  type CreateStudioOutput,
} from "../schemas/createStudioSchema";

interface StudioFormProps {
  formId: string;
  onSubmit: (data: CreateStudioOutput) => void;
  defaultValues?: Partial<CreateStudioInput>;
}

export function StudioForm({ formId, onSubmit, defaultValues }: StudioFormProps) {
  const form = useForm<CreateStudioInput, any, CreateStudioOutput>({
    resolver: zodResolver(createStudioSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      slug: defaultValues?.slug || "",
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
