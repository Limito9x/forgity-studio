import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, Box } from "lucide-react";

interface DeleteStageConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName: string;
  childCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteStageConfirmDialog({
  open,
  onOpenChange,
  stageName,
  childCount,
  onConfirm,
  onCancel,
}: DeleteStageConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleCancel();
        else onOpenChange(isOpen);
      }}
      title="Delete Stage Scope"
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleConfirm} className="gap-1.5">
            <Trash2 className="w-4 h-4" />
            Delete Stage
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-destructive dark:text-red-400">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Destructive Action Warning</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Deleting this stage container will permanently remove it and all contained child nodes and wiring from the pipeline graph.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Target Stage:</span>
            <span className="font-semibold text-foreground max-w-[240px] truncate">{stageName || "Unnamed Stage"}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Child Nodes:</span>
            <Badge variant={childCount > 0 ? "secondary" : "outline"} className="gap-1 font-mono text-[11px]">
              <Box className="w-3 h-3 text-muted-foreground" />
              {childCount} {childCount === 1 ? "node" : "nodes"} inside
            </Badge>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
