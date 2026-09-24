import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useCreateRepository } from "../hooks/useRepositories";
import { CreateRepositoryForm } from "../components/CreateRepositoryForm";
import { toast } from "sonner";

export interface CreateRepositoryDialogData {
  projectId: string;
}

export function CreateRepositoryDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<CreateRepositoryDialogData>) {
  const projectId = data?.projectId || "";
  const createRepository = useCreateRepository(projectId);

  return (
    <BaseFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Repository"
      formId="create-repository-form"
      isPending={createRepository.isPending}
      size="md"
    >
      <CreateRepositoryForm
        formId="create-repository-form"
        onSubmit={(values) => {
          if (!projectId) {
            toast.error("Project ID is missing");
            return;
          }
          createRepository.mutate(
            {
              data: {
                projectId,
                name: values.name,
                description: values.description || undefined,
              },
            },
            {
              onSuccess: (res) => {
                toast.success(`Repository "${res.name}" created`);
                onOpenChange(false);
              },
            }
          );
        }}
      />
    </BaseFormDialog>
  );
}
