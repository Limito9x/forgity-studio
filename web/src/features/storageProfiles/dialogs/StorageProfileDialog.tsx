import React, { useState, useEffect } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Zap,
  Cloud,
  Info,
} from "lucide-react";
import {
  useCreateStorageProfile,
  useUpdateStorageProfile,
  useTestStorageConnection,
} from "../hooks/useStorageProfiles";
import type { StorageProfileDto, StorageProviderType } from "../types";

interface StorageProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studioId: string;
  profile?: StorageProfileDto | null;
}

export function StorageProfileDialog({
  open,
  onOpenChange,
  studioId,
  profile,
}: StorageProfileDialogProps) {
  const isEditing = !!profile;
  const isStudioCloud = profile?.providerType === 0;
  const createMutation = useCreateStorageProfile();
  const updateMutation = useUpdateStorageProfile();
  const testMutation = useTestStorageConnection();

  const [providerType, setProviderType] = useState<StorageProviderType>(
    profile?.providerType ?? 1
  );
  const [name, setName] = useState(profile?.name ?? "");
  const [bucketName, setBucketName] = useState(profile?.bucketName ?? "");
  const [serviceUrl, setServiceUrl] = useState(profile?.serviceUrl ?? "");
  const [region, setRegion] = useState(profile?.region ?? "");
  const [accessKey, setAccessKey] = useState(profile?.accessKey ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState(profile?.publicBaseUrl ?? "");
  const [storageQuotaMb, setStorageQuotaMb] = useState<string>(
    profile?.storageQuotaBytes
      ? Math.round(profile.storageQuotaBytes / (1024 * 1024)).toString()
      : ""
  );
  const [isDefault, setIsDefault] = useState(profile?.isDefault ?? false);

  const [showSecretKey, setShowSecretKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      if (profile) {
        setProviderType(profile.providerType);
        setName(profile.name);
        setBucketName(profile.bucketName);
        setServiceUrl(profile.serviceUrl);
        setRegion(profile.region ?? "");
        setAccessKey(profile.accessKey ?? "");
        setSecretKey("");
        setPublicBaseUrl(profile.publicBaseUrl ?? "");
        setStorageQuotaMb(
          profile.storageQuotaBytes
            ? Math.round(profile.storageQuotaBytes / (1024 * 1024)).toString()
            : ""
        );
        setIsDefault(profile.isDefault);
      } else {
        setProviderType(1); // Custom S3
        setName("");
        setBucketName("");
        setServiceUrl("");
        setRegion("");
        setAccessKey("");
        setSecretKey("");
        setPublicBaseUrl("");
        setStorageQuotaMb("");
        setIsDefault(false);
      }
      setTestResult(null);
      setShowSecretKey(false);
    }
  }, [open, profile]);

  const handleTestConnection = async () => {
    if (providerType === 1) {
      if (!bucketName || !serviceUrl) {
        toast.error("Please provide Bucket Name and Service URL to test connection.");
        return;
      }
      if (!accessKey) {
        toast.error("Access Key is required to test S3 connection.");
        return;
      }
      if (!isEditing && !secretKey) {
        toast.error("Secret Key is required to test S3 connection.");
        return;
      }
    }

    try {
      const res = await testMutation.mutateAsync({
        data: {
          providerType,
          bucketName,
          serviceUrl,
          region: region || undefined,
          accessKey: accessKey || "",
          secretKey: secretKey || "",
        },
      });
      setTestResult(res);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Failed to test connection";
      setTestResult({ success: false, message: msg });
      toast.error(msg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Profile Name is required.");
      return;
    }

    if (providerType === 1) {
      if (!bucketName.trim() || !serviceUrl.trim()) {
        toast.error("Bucket Name and Service URL are required for Custom S3.");
        return;
      }
      if (!isEditing && (!accessKey.trim() || !secretKey.trim())) {
        toast.error("Access Key and Secret Key are required for new Custom S3 profiles.");
        return;
      }
    }

    const quotaBytes = storageQuotaMb ? parseInt(storageQuotaMb, 10) * 1024 * 1024 : null;

    try {
      if (isEditing && profile) {
        await updateMutation.mutateAsync({
          id: profile.id,
          data: {
            name: name.trim(),
            providerType,
            bucketName: bucketName.trim(),
            serviceUrl: serviceUrl.trim(),
            region: region.trim() || undefined,
            accessKey: accessKey.trim() || undefined,
            secretKey: secretKey.trim() || undefined,
            publicBaseUrl: publicBaseUrl.trim() || undefined,
            storageQuotaBytes: quotaBytes,
            isDefault,
          },
        });
        toast.success("Storage profile updated successfully.");
      } else {
        await createMutation.mutateAsync({
          data: {
            studioId,
            name: name.trim(),
            providerType: 1, // Custom S3
            bucketName: bucketName.trim(),
            serviceUrl: serviceUrl.trim(),
            region: region.trim() || undefined,
            accessKey: accessKey.trim(),
            secretKey: secretKey.trim(),
            publicBaseUrl: publicBaseUrl.trim() || undefined,
            storageQuotaBytes: quotaBytes,
            isDefault,
          },
        });
        toast.success("Custom S3 storage profile connected successfully.");
      }

      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save storage profile.");
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEditing
          ? isStudioCloud
            ? "Configure Studio Cloud Profile"
            : "Edit Custom S3 Profile"
          : "Connect Custom S3 Storage (BYOS)"
      }
      description={
        isStudioCloud
          ? "Manage quota and default settings for your studio's managed cloud storage."
          : "Connect your own S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, Wasabi) for unlimited asset storage."
      }
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {providerType === 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={handleTestConnection}
              isDisabled={testMutation.isPending}
              className="flex items-center gap-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Test Connection
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onPress={() => onOpenChange(false)}
              isDisabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="storage-profile-form"
              isDisabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Connect Storage"}
            </Button>
          </div>
        </div>
      }
    >
      <form id="storage-profile-form" onSubmit={handleSubmit} className="space-y-5 py-1">
        {/* Managed Studio Cloud Notice or BYOS Header */}
        {isStudioCloud ? (
          <div className="flex items-center gap-3 rounded-xl border border-sky-500/20 bg-sky-500/10 p-3.5 text-xs text-sky-800 dark:text-sky-300">
            <Cloud className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
            <div>
              <span className="font-semibold">System Managed Storage</span>
              <p className="text-muted-foreground mt-0.5">
                Studio Cloud is automatically provisioned and managed by the platform. You can customize its display name or storage quota capacity.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5 text-xs">
              <Server className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <span className="font-semibold text-foreground">Bring Your Own Storage (BYOS)</span>
                <p className="text-muted-foreground mt-0.5">
                  Assets will be uploaded directly to your S3 bucket via presigned URLs with zero platform capacity limits.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-sky-500 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">IAM Permissions & File Lifecycle:</span>
                <p className="mt-0.5">
                  Grant <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">s3:PutObject</code> and <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">s3:GetObject</code>. 
                  Optionally grant <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">s3:DeleteObject</code> if you want unreferenced/orphaned files to be automatically cleaned up after 24 hours to save storage costs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Profile Name & Bucket Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sp-name">Profile Display Name <span className="text-destructive">*</span></Label>
            <Input
              id="sp-name"
              placeholder="e.g. Production Assets Bucket"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-bucket">
              Bucket Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sp-bucket"
              placeholder="e.g. my-studio-assets"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              disabled={isStudioCloud}
              required
            />
          </div>
        </div>

        {/* S3 Details */}
        {providerType === 1 && (
          <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="sp-url">
                  Service URL / Endpoint <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sp-url"
                  placeholder="https://s3.amazonaws.com or https://<id>.r2.cloudflarestorage.com"
                  value={serviceUrl}
                  onChange={(e) => setServiceUrl(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sp-region">Region</Label>
                <Input
                  id="sp-region"
                  placeholder="us-east-1 (or auto)"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sp-access">
                  Access Key ID {!isEditing && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="sp-access"
                  placeholder="e.g. AKIA..."
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  required={!isEditing}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sp-secret">
                  Secret Access Key {!isEditing && <span className="text-destructive">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="sp-secret"
                    type={showSecretKey ? "text" : "password"}
                    placeholder={isEditing && profile?.hasSecretKey ? "•••••••• (unchanged)" : "Enter secret key"}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    required={!isEditing}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sp-base-url">Custom Public Base URL (CDN)</Label>
                <Input
                  id="sp-base-url"
                  placeholder="e.g. https://cdn.mystudio.com (optional)"
                  value={publicBaseUrl}
                  onChange={(e) => setPublicBaseUrl(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sp-quota">Storage Quota Capacity (MB)</Label>
                <Input
                  id="sp-quota"
                  type="number"
                  placeholder="Empty for unlimited"
                  value={storageQuotaMb}
                  onChange={(e) => setStorageQuotaMb(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {isStudioCloud && (
          <div className="space-y-1.5">
            <Label htmlFor="sp-cloud-quota">Storage Quota Capacity (MB)</Label>
            <Input
              id="sp-cloud-quota"
              type="number"
              placeholder="Default is 200MB"
              value={storageQuotaMb}
              onChange={(e) => setStorageQuotaMb(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Total storage capacity allocated for this studio. Default is 200 MB.
            </p>
          </div>
        )}

        {/* Set Default Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 p-3.5">
          <div className="space-y-0.5">
            <Label htmlFor="sp-default" className="font-medium cursor-pointer">
              Set as Default Studio Storage Profile
            </Label>
            <p className="text-xs text-muted-foreground">
              New projects without a specific storage profile will automatically use this profile.
            </p>
          </div>
          <Switch
            id="sp-default"
            isSelected={isDefault}
            onChange={setIsDefault}
          />
        </div>

        {/* Test Connection Banner */}
        {testResult && (
          <div
            className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
              testResult.success
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/20 bg-destructive/10 text-destructive"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            )}
            <div className="flex-1 font-medium leading-relaxed">{testResult.message}</div>
          </div>
        )}
      </form>
    </BaseDialog>
  );
}
