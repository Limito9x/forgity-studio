import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useAttachRunnerToRepository } from "../hooks/useRepositories";
import { AttachRunnerForm } from "../components/AttachRunnerForm";
import { toast } from "sonner";

export interface AttachRunnerToRepositoryDialogData {
  repositoryId: string;
  repositoryName?: string;
  runnerId?: string;
  rootPath?: string;
}

export function AttachRunnerDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<AttachRunnerToRepositoryDialogData>) {
  const repositoryId = data?.repositoryId || "";
  const attachRunner = useAttachRunnerToRepository(repositoryId);

  return (
    <BaseFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={data?.repositoryName ? `Attach Runner to "${data.repositoryName}"` : "Attach Runner"}
      description="Connect a physical compute machine to this repository by binding its local directory."
      formId="attach-runner-form"
      isPending={attachRunner.isPending}
      size="2xl"
    >
      <AttachRunnerForm
        formId="attach-runner-form"
        defaultValues={{
          runnerId: data?.runnerId || "",
          rootPath: data?.rootPath || "",
        }}
        onSubmit={(values) => {
          if (!repositoryId) {
            toast.error("Repository ID is missing");
            return;
          }
          attachRunner.mutate(
            {
              data: {
                repositoryId,
                runnerId: values.runnerId,
                rootPath: values.rootPath,
              },
            },
            {
              onSuccess: () => {
                toast.success("Runner successfully attached to repository");
                onOpenChange(false);
              },
              onError: (err: any) => {
                toast.error(err?.response?.data?.message || err?.message || "Failed to attach runner");
              },
            }
          );
        }}
      />
    </BaseFormDialog>
  );
}
