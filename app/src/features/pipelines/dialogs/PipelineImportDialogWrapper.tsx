import type { DialogProps } from "@/lib/dialog-registry";
import { ImportPipelineDialog } from "./ImportPipelineDialog";

export function PipelineImportDialogWrapper({
  open,
  onOpenChange,
  data,
}: DialogProps<{ projectId: string }>) {
  if (!data?.projectId) return null;

  return (
    <ImportPipelineDialog
      projectId={data.projectId}
      isOpen={open}
      onClose={() => onOpenChange(false)}
    />
  );
}
