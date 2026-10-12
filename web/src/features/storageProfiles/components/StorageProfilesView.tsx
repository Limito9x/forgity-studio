import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/custom-ui/overlays/dialog/ConfirmDialog";
import {
  Cloud,
  Server,
  Plus,
  Zap,
  MoreVertical,
  Pencil,
  Trash2,
  HardDrive,
  Loader2,
  Check,
  ShieldCheck,
  Database,
  HelpCircle,
  Info,
} from "lucide-react";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import {
  useStorageProfiles,
  useDeleteStorageProfile,
  useUpdateStorageProfile,
  useTestStorageConnection,
} from "../hooks/useStorageProfiles";
import { StorageProfileDialog } from "../dialogs/StorageProfileDialog";
import type { StorageProfileDto } from "../types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function StorageProfilesView() {
  const { studioId } = useCurrentStudio();
  const { data: profiles = [], isLoading } = useStorageProfiles(studioId);
  const deleteMutation = useDeleteStorageProfile();
  const updateMutation = useUpdateStorageProfile();
  const testMutation = useTestStorageConnection();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StorageProfileDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleCreateNew = () => {
    setEditingProfile(null);
    setDialogOpen(true);
  };

  const handleEdit = (profile: StorageProfileDto) => {
    setEditingProfile(profile);
    setDialogOpen(true);
  };

  const handleSetDefault = async (profile: StorageProfileDto) => {
    try {
      await updateMutation.mutateAsync({
        id: profile.id,
        data: {
          name: profile.name,
          providerType: profile.providerType,
          bucketName: profile.bucketName,
          serviceUrl: profile.serviceUrl,
          region: profile.region ?? undefined,
          accessKey: profile.accessKey ?? undefined,
          publicBaseUrl: profile.publicBaseUrl ?? undefined,
          storageQuotaBytes: profile.storageQuotaBytes ?? undefined,
          isDefault: true,
        },
      });
      toast.success(`'${profile.name}' is now the default storage profile.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to set default profile.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingId });
      toast.success("Storage profile deleted successfully.");
      setDeletingId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete storage profile.");
    }
  };

  const handleTestProfile = async (profile: StorageProfileDto) => {
    setTestingId(profile.id);
    try {
      const res = await testMutation.mutateAsync({
        data: {
          providerType: profile.providerType,
          bucketName: profile.bucketName,
          serviceUrl: profile.serviceUrl,
          region: profile.region ?? undefined,
          accessKey: profile.accessKey ?? "",
          secretKey: "",
        },
      });
      if (res.success) {
        toast.success(`[${profile.name}] ${res.message}`);
      } else {
        toast.error(`[${profile.name}] ${res.message}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Connection test failed.");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <HardDrive className="h-6 w-6 text-primary" />
            Studio Storage Profiles
            <TooltipTrigger delay={150}>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                aria-label="Storage lifecycle info"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              <Tooltip className="max-w-xs space-y-1.5 p-3 text-xs leading-relaxed shadow-lg">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Storage & Retention Policy
                </span>
                <p className="text-muted-foreground">
                  Assets are uploaded via presigned URLs and deduplicated using SHA-256. Unreferenced files are purged after 24 hours.
                </p>
                <p className="text-muted-foreground">
                  To prevent physical deletion on your custom S3 bucket, simply omit the <code className="font-mono text-[11px] text-foreground bg-muted px-1 py-0.5 rounded">s3:DeleteObject</code> permission in your IAM policy.
                </p>
              </Tooltip>
            </TooltipTrigger>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage storage capacity and connect custom S3 buckets (BYOS) for 3D assets and project files.
          </p>
        </div>
        <Button onPress={handleCreateNew} size="sm" className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          Connect Custom S3
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 rounded-2xl border bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/10 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-sm">
            <Server className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold">No Custom Storage Profiles</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-1.5 mb-5">
            By default, your studio uses the platform managed Studio Cloud storage (200MB initial quota). Connect your own S3 bucket for unlimited storage.
          </p>
          <Button onPress={handleCreateNew} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Connect Custom S3 Bucket
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((profile) => {
            const isStudioCloud = profile.providerType === 0;
            const usedBytes = profile.usedSizeBytes || 0;
            const quotaBytes = profile.storageQuotaBytes;
            const usagePercent = quotaBytes
              ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
              : null;

            return (
              <div
                key={profile.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all shadow-sm ${
                  profile.isDefault
                    ? "border-primary/40 bg-card ring-1 ring-primary/20"
                    : "border-border/60 bg-card hover:border-border"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                          isStudioCloud
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                            : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                        }`}
                      >
                        {isStudioCloud ? (
                          <Cloud className="h-6 w-6" />
                        ) : (
                          <Server className="h-6 w-6" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground text-sm">
                            {profile.name}
                          </h4>
                          {profile.isDefault && (
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium border-emerald-500/20">
                              Default
                            </Badge>
                          )}
                          {isStudioCloud && (
                            <Badge variant="outline" className="text-[10px] text-sky-600 dark:text-sky-400 border-sky-500/20 bg-sky-500/5">
                              System Managed
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isStudioCloud ? "Built-in Studio Cloud" : "Custom S3 Compatible"}
                        </p>
                      </div>
                    </div>

                    <DropdownMenuTrigger>
                      <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      <DropdownMenu placement="bottom end" className="w-48">
                        <DropdownMenuItem onAction={() => handleEdit(profile)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Profile
                        </DropdownMenuItem>
                        {!profile.isDefault && (
                          <DropdownMenuItem onAction={() => handleSetDefault(profile)}>
                            <Check className="mr-2 h-4 w-4" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        {!isStudioCloud && (
                          <DropdownMenuItem
                            onAction={() => handleTestProfile(profile)}
                            className="text-emerald-600 dark:text-emerald-400"
                          >
                            <Zap className="mr-2 h-4 w-4" />
                            Test Connection
                          </DropdownMenuItem>
                        )}
                        {!isStudioCloud && (
                          <DropdownMenuItem
                            onAction={() => setDeletingId(profile.id)}
                            variant="destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Profile
                          </DropdownMenuItem>
                        )}
                      </DropdownMenu>
                    </DropdownMenuTrigger>
                  </div>

                  {/* Storage Quota Progress Bar */}
                  <div className="space-y-1.5 mb-4 bg-muted/20 rounded-xl p-3 border border-border/40">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        Storage Used
                      </span>
                      <span className="text-foreground">
                        {formatBytes(usedBytes)}{" "}
                        <span className="text-muted-foreground">
                          / {quotaBytes ? formatBytes(quotaBytes) : "Unlimited"}
                        </span>
                      </span>
                    </div>

                    {quotaBytes ? (
                      <div className="w-full bg-muted/80 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            (usagePercent ?? 0) > 90
                              ? "bg-rose-500"
                              : (usagePercent ?? 0) > 75
                              ? "bg-amber-500"
                              : "bg-primary"
                          }`}
                          style={{ width: `${Math.max(2, usagePercent ?? 0)}%` }}
                        />
                      </div>
                    ) : (
                      <div className="w-full bg-emerald-500/20 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-emerald-500 h-1.5 w-full" />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                      <span>{usagePercent !== null ? `${usagePercent}% used` : "Zero capacity limit"}</span>
                      {quotaBytes && (
                        <span>
                          {formatBytes(Math.max(0, quotaBytes - usedBytes))} available
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground/90 bg-muted/30 rounded-xl p-3 border border-border/40">
                    <div className="flex justify-between">
                      <span className="font-medium text-muted-foreground">Bucket:</span>
                      <span className="font-mono text-foreground font-medium">{profile.bucketName}</span>
                    </div>
                    {!isStudioCloud && (
                      <div className="flex justify-between truncate">
                        <span className="font-medium text-muted-foreground shrink-0">Endpoint:</span>
                        <span className="truncate max-w-[220px] font-mono text-muted-foreground" title={profile.serviceUrl}>
                          {profile.serviceUrl}
                        </span>
                      </div>
                    )}
                    {profile.region && (
                      <div className="flex justify-between">
                        <span className="font-medium text-muted-foreground">Region:</span>
                        <span className="font-mono text-foreground">{profile.region}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/40 text-xs">
                  <span className="text-muted-foreground">
                    Added {new Date(profile.createdAt).toLocaleDateString()}
                  </span>
                  {!isStudioCloud ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onPress={() => handleTestProfile(profile)}
                      isDisabled={testingId === profile.id}
                      className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {testingId === profile.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      Verify
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Active
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog for Add / Edit */}
      {dialogOpen && (
        <StorageProfileDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          studioId={studioId ?? ""}
          profile={editingProfile}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Delete Storage Profile?"
        description="Are you sure you want to delete this storage profile? If any assets are currently saved under this storage bucket, deletion will be prevented."
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
