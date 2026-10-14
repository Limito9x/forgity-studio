import { useState } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, Loader2, Sparkles, Cpu, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { usePublishResourceVersion, type ResourceVersionDto, type ResourceVersionLocationDto } from "../hooks/useRepositories";
import { useRunners } from "@/features/runners/hooks/useRunners";

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
  const { data: runners = [], isLoading: isLoadingRunners } = useRunners();

  if (!version) return null;

  const locations = (version.locations || []) as ResourceVersionLocationDto[];
  const originLocation = locations.find((l) => l.isOrigin) || locations[0];
  const targetRunner = runners.find(
    (r) =>
      (originLocation?.machineKey && r.machineKey === originLocation.machineKey) ||
      (originLocation?.runnerName && r.name === originLocation.runnerName)
  ) || (runners.length === 1 ? runners[0] : undefined);

  // If runner is known to be offline (isOnline === false), flag as offline. Otherwise treat as online/ready.
  const isRunnerOnline = targetRunner
    ? (targetRunner.isOnline !== undefined ? targetRunner.isOnline : (targetRunner.isActive ?? true))
    : (runners.length > 0 ? (runners[0].isOnline ?? true) : false);

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
        isDisabled={publishMutation.isPending || !isRunnerOnline || isLoadingRunners}
        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {publishMutation.isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span>Uploading & Publishing...</span>
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
        {/* Runner Daemon Connection Status */}
        {isLoadingRunners ? (
          <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/50 bg-muted/20 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span>Checking Runner Daemon connection...</span>
          </div>
        ) : isRunnerOnline ? (
          <div className="flex items-center justify-between text-xs p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <div className="flex items-center gap-2 min-w-0">
              <Cpu className="size-4 shrink-0 text-emerald-400" />
              <span className="truncate">
                Origin Runner: <strong>{targetRunner?.name || originLocation?.runnerName || "Physical Workstation"}</strong>
              </span>
            </div>
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 bg-emerald-500/10 text-[10px] gap-1 shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Daemon Online
            </Badge>
          </div>
        ) : (
          <div className="p-3 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-xs space-y-1.5">
            <div className="flex items-center justify-between font-semibold">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-4 shrink-0 text-destructive" />
                <span>Origin Runner Daemon Offline</span>
              </div>
              <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10 text-[10px]">
                Disconnected
              </Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Physical machine <strong className="text-foreground">"{originLocation?.runnerName || "Local Runner"}"</strong> is not connected via gRPC stream. Please start the daemon (<code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px] text-foreground">runner.bat start</code>) on that machine before publishing.
            </p>
          </div>
        )}

        <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Target Version:</span>
            <Badge variant="outline" className="font-mono text-xs border-emerald-500/30 bg-emerald-500/10 gap-1.5 inline-flex items-center py-0.5 px-2">
              <span className="font-semibold text-foreground">v{version.versionNo}</span>
              <span className="text-amber-500">Draft</span>
              <ArrowRight className="size-3 text-muted-foreground" />
              <span className="text-emerald-500 font-semibold">Published</span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Publishing will order the origin Runner daemon to stream and sync this asset file to Studio Cloud Storage (MinIO/S3), freeze version v{version.versionNo}, and release the collaborative lock. Any future local edits will begin draft v{version.versionNo + 1}.
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
