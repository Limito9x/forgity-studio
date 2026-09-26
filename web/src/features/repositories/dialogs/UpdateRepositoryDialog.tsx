import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useUpdateRepository } from "../hooks/useRepositories";
import { CreateRepositoryForm } from "../components/CreateRepositoryForm";
import { toast } from "sonner";

export interface UpdateRepositoryDialogData {
  id: string;
  name: string;
  description?: string;
  projectId?: string;
}

export function UpdateRepositoryDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<UpdateRepositoryDialogData>) {
  const updateRepository = useUpdateRepository(data?.projectId);

  if (!data?.id) return null;

  return (
    <BaseFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Repository"
      formId="update-repository-form"
      isPending={updateRepository.isPending}
      size="md"
    >
      <CreateRepositoryForm
        formId="update-repository-form"
        defaultValues={{
          name: data.name,
          description: data.description || "",
        }}
        onSubmit={(values) => {
          updateRepository.mutate(
            {
              id: data.id,
              data: {
                name: values.name,
                description: values.description || undefined,
              },
            },
            {
              onSuccess: (res) => {
                toast.success(`Repository "${res.name}" updated`);
                onOpenChange(false);
              },
            }
          );
        }}
      />
    </BaseFormDialog>
  );
}
