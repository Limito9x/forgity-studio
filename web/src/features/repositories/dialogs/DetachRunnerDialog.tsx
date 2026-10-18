import { useState, useEffect } from "react";
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
  const [forceMode, setForceMode] = useState(false);
  const detachRunner = useDetachRunnerFromRepository(data?.repositoryId);

  // Reset forceMode when dialog re-opens
  useEffect(() => {
    if (open) {
      setForceMode(false);
    }
  }, [open]);

  const handleConfirm = () => {
    if (!data?.repositoryId || !data?.runnerId) return;

    detachRunner.mutate(
      {
        repositoryId: data.repositoryId,
        runnerId: data.runnerId,
        params: { force: forceMode },
      },
      {
        onSuccess: () => {
          toast.success("Runner detached from repository successfully.");
          setForceMode(false);
          onOpenChange(false);
        },
        onError: () => {
          // api-client.ts already displays the error toast with deduplication.
          // Switch to force mode so user can proceed with Force Detach if desired.
          setForceMode(true);
        },
      }
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(val) => {
        if (!val) setForceMode(false);
        onOpenChange(val);
      }}
      title={forceMode ? "Force Detach Runner?" : "Detach Runner from Repository"}
      description={
        forceMode
          ? `Some draft resource versions only exist locally on "${data?.runnerName || "this runner"}" and have not been published to cloud storage. Detaching will remove the mount link. Do you want to FORCE DETACH anyway?`
          : `Are you sure you want to detach runner "${data?.runnerName || data?.runnerId || "Runner"}" from "${data?.repositoryName || "this repository"}"? All local project files on this machine will remain safe, but this mount point will be removed.`
      }
      confirmText={forceMode ? "Force Detach" : "Detach Runner"}
      variant="destructive"
      isLoading={detachRunner.isPending}
      onConfirm={handleConfirm}
    />
  );
}

