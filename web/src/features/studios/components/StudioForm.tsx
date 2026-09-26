import { useEffect } from "react";
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

  const nameValue = form.watch("name");
  useEffect(() => {
    if (nameValue) {
      const currentSlug = form.getValues("slug");
      if (!currentSlug || currentSlug === slugify(defaultValues?.name || "")) {
        form.setValue("slug", slugify(nameValue), { shouldValidate: true });
      }
    }
  }, [nameValue, defaultValues?.name, form]);

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
        <FormInput
          control={form.control}
          label="Slug (URL identifier)"
          name="slug"
          type="text"
          placeholder="e.g. acme-vfx-studio"
        />
        <FormTextarea
          control={form.control}
          label="Description"
          name="description"
          placeholder="Brief description of your studio..."
          rows={3}
        />
      </FormGrid>
    </Form>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
