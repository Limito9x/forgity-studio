import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useCreateStudio } from "../hooks/useStudios";
import { StudioForm } from "../components/StudioForm";
import { useStudioStore } from "@/stores/studioStore";
import { toast } from "sonner";

export function CreateStudioDialog({ open, onOpenChange }: DialogProps<undefined>) {
  const createStudio = useCreateStudio();
  const setActiveStudioId = useStudioStore((s) => s.setActiveStudioId);

  return (
    <BaseFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Studio"
      formId="create-studio-form"
      isPending={createStudio.isPending}
      size="md"
    >
      <StudioForm
        formId="create-studio-form"
        onSubmit={(values) => {
          createStudio.mutate(
            {
              data: {
                name: values.name,
                slug: values.slug || undefined,
                description: values.description || undefined,
              },
            },
            {
              onSuccess: (data) => {
                toast.success(`Studio "${data.name}" created successfully`);
                setActiveStudioId(data.id);
                onOpenChange(false);
              },
            }
          );
        }}
      />
    </BaseFormDialog>
  );
}
