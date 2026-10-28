import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useUpdateStudio, type StudioDto } from "../hooks/useStudios";
import { EditStudioForm } from "../components/EditStudioForm";
import { setCurrentStudio, useCurrentStudio } from "../hooks/useCurrentStudio";
import { toast } from "sonner";

export interface EditStudioDialogPayload {
  studio?: StudioDto;
}

export function EditStudioDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<EditStudioDialogPayload | undefined>) {
  const { studio: activeStudio } = useCurrentStudio();
  const updateStudio = useUpdateStudio();

  const targetStudio = data?.studio ?? activeStudio;

  if (!targetStudio) {
    return null;
  }

  return (
    <BaseFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Studio Settings"
      description="Update your studio name and description"
      formId="edit-studio-form"
      isPending={updateStudio.isPending}
      size="md"
    >
      <EditStudioForm
        formId="edit-studio-form"
        defaultValues={{
          name: targetStudio.name,
          description: targetStudio.description ?? "",
        }}
        onSubmit={(values) => {
          updateStudio.mutate(
            {
              id: targetStudio.id,
              data: {
                name: values.name,
                description: values.description || undefined,
              },
            },
            {
              onSuccess: (data) => {
                toast.success(`Studio "${data.name}" updated successfully`);
                setCurrentStudio(data);
                onOpenChange(false);
              },
              onError: (error: any) => {
                const message = error?.response?.data?.errors?.[0]?.message || error?.message || "Failed to update studio";
                toast.error(message);
              },
            }
          );
        }}
      />
    </BaseFormDialog>
  );
}
