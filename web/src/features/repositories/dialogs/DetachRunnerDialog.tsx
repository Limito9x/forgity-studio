import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import { useDetachRunnerFromRepository } from "../hooks/useRepositories";
import type { DialogProps } from "@/lib/dialog-registry";
import { toast } from "sonner";

export interface DetachRunnerFromRepositoryDialogData {
  repositoryId: string;
  repositoryName?: string;
  runnerId: string;
  runnerName?: string;
  rootPath?: string;
}

export function DetachRunnerDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<DetachRunnerFromRepositoryDialogData>) {
  const detachRunner = useDetachRunnerFromRepository(data?.repositoryId);

  const handleConfirm = () => {
    if (!data?.repositoryId || !data?.runnerId) return;

    detachRunner.mutate(
      {
        repositoryId: data.repositoryId,
        runnerId: data.runnerId,
        params: { force: false },
      },
      {
        onSuccess: () => {
          toast.success("Runner detached from repository successfully.");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Detach Runner from Repository"
      description={`Are you sure you want to detach runner "${data?.runnerName || data?.runnerId || "Runner"}" from "${data?.repositoryName || "this repository"}"? All local project files on this machine will remain safe, but this mount point will be removed.`}
      confirmText="Detach Runner"
      variant="destructive"
      isLoading={detachRunner.isPending}
      onConfirm={handleConfirm}
    />
  );
}


