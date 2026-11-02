import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormTextarea, FormTagsInput } from "@/components/form-controls";
import {
  createRepositorySchema,
  type CreateRepositoryInput,
  type CreateRepositoryOutput,
} from "../schemas/repositorySchema";

interface CreateRepositoryFormProps {
  formId?: string;
  onSubmit: (values: CreateRepositoryOutput) => void;
  defaultValues?: Partial<CreateRepositoryInput>;
}

export function CreateRepositoryForm({
  formId = "repository-form",
  onSubmit,
  defaultValues,
}: CreateRepositoryFormProps) {
  const form = useForm<CreateRepositoryInput, any, CreateRepositoryOutput>({
    resolver: zodResolver(createRepositorySchema),
    defaultValues: {
      name: defaultValues?.name || "",
      description: defaultValues?.description || "",
      supportedExtensions: defaultValues?.supportedExtensions || [],
      includedSubPaths: defaultValues?.includedSubPaths || [],
      maxScanFiles: defaultValues?.maxScanFiles ?? 2000,
    },
  });

  return (
    <Form form={form} formId={formId} onSubmit={onSubmit}>
      <FormGrid cols={1} className="gap-4">
        <FormInput
          control={form.control}
          label="Repository Name"
          name="name"
          type="text"
          placeholder="e.g. Daz Source Library, Blender Staging, Unreal Assets..."
          isRequired
        />

        <FormTextarea
          control={form.control}
          label="Description"
          name="description"
          placeholder="Describe the resources managed in this repository..."
          rows={3}
        />

        <FormTagsInput
          control={form.control}
          label="Supported Extensions"
          name="supportedExtensions"
          placeholder="e.g. blend, fbx, obj (press Enter or comma)"
          description="Extensions tracked by this repository. Leave empty to allow all files. Stored without dot."
          transformTag={(tag) => tag.replace(/^\.+/, "").toLowerCase().trim()}
          renderTagLabel={(tag) => `.${tag}`}
        />

        <FormTagsInput
          control={form.control}
          label="Included Sub-Paths (Folders)"
          name="includedSubPaths"
          placeholder="e.g. Characters, Systems/Wardrobe (press Enter)"
          description="Target subfolders to scan from RootPath. Leave empty to scan entire root directory."
          transformTag={(tag) => tag.replace(/^[\/\\]+|[\/\\]+$/g, "").trim()}
          renderTagLabel={(tag) => `📁 ${tag}`}
        />

        <FormInput
          control={form.control}
          label="Max Scan Limit"
          name="maxScanFiles"
          type="number"
          placeholder="2000"
          description="Maximum files to scan per sync to prevent memory overload."
        />
      </FormGrid>
    </Form>
  );
}
