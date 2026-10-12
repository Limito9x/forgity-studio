import { useState } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { usePublishResourceVersion, type ResourceVersionDto } from "../hooks/useRepositories";

export interface PublishVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: ResourceVersionDto | null;
  resourceName?: string;
  resourceId?: string;
  repositoryId?: string;
  onSuccess?: () => void;
}

export function PublishVersionDialog({
  open,
  onOpenChange,
  version,
  resourceName,
  resourceId,
  repositoryId,
  onSuccess,
}: PublishVersionDialogProps) {
  const [notes, setNotes] = useState("");
  const publishMutation = usePublishResourceVersion(resourceId, repositoryId);

  if (!version) return null;

  const handlePublish = () => {
    publishMutation.mutate(
      {
        id: version.id,
        data: {
          resourceVersionId: version.id,
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Version v${version.versionNo} published successfully!`);
          setNotes("");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err?.message || "Failed to publish version");
        },
      }
    );
  };

  const footer = (
    <div className="flex items-center justify-end gap-2 w-full">
      <Button
        variant="outline"
        size="sm"
        onPress={() => onOpenChange(false)}
        isDisabled={publishMutation.isPending}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        onPress={handlePublish}
        isDisabled={publishMutation.isPending}
        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {publishMutation.isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span>Publishing...</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="size-3.5" />
            <span>Confirm & Publish Version</span>
          </>
        )}
      </Button>
    </div>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Publish Resource Version"
      description={`Freeze version v${version.versionNo} of "${resourceName || "Resource"}" as an approved immutable release.`}
      footer={footer}
      size="md"
    >
      <div className="space-y-4 py-2">
        <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Target Version:</span>
            <Badge variant="outline" className="font-mono text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
              v{version.versionNo} (Draft $\rightarrow$ Published)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Publishing this version marks it as ready for downstream stages. Any future local edits on the disk will automatically initiate a new draft revision (v{version.versionNo + 1}).
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            Release Notes / Changelog (Optional)
          </label>
          <Input
            placeholder="e.g. Rigging completed, material textures approved for rendering..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs h-9"
          />
        </div>
      </div>
    </BaseDialog>
  );
}
