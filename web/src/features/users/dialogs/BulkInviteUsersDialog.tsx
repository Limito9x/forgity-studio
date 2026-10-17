import { useState, useMemo } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useBulkInviteUsers } from "../hooks/useUsers";
import { useRoleOptions } from "@/features/roles/hooks/useRoles";
import { toast } from "sonner";
import { 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Send, 
  RotateCcw, 
  Users, 
  ExternalLink 
} from "lucide-react";
import type { DialogProps } from "@/lib/dialog-registry";
import type { BulkInviteUsersResponse } from "@/gen/model";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function BulkInviteUsersDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<{ onSuccess?: () => void }>) {
  const [rawEmails, setRawEmails] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [personalNote, setPersonalNote] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [result, setResult] = useState<BulkInviteUsersResponse | null>(null);

  const { data: roleOptions, isLoading: isRolesLoading } = useRoleOptions();
  const bulkInviteMutation = useBulkInviteUsers();

  // Parse emails dynamically from comma, space, or newline
  const { validEmails, invalidEmails } = useMemo(() => {
    if (!rawEmails.trim()) {
      return { validEmails: [], invalidEmails: [] };
    }

    const tokens = rawEmails
      .split(/[\s,\n\r;]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const uniqueTokens = Array.from(new Set(tokens));
    const valid: string[] = [];
    const invalid: string[] = [];

    uniqueTokens.forEach((token) => {
      if (EMAIL_REGEX.test(token)) {
        valid.push(token);
      } else {
        invalid.push(token);
      }
    });

    return { validEmails: valid, invalidEmails: invalid };
  }, [rawEmails]);

  const handleReset = () => {
    setRawEmails("");
    setPersonalNote("");
    setDiscordUrl("");
    setResult(null);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (validEmails.length === 0) {
      toast.error("Please enter at least one valid email address.");
      return;
    }

    try {
      const res = await bulkInviteMutation.mutateAsync({
        data: {
          emails: validEmails,
          roleId: selectedRoleId || undefined,
          personalNote: personalNote.trim() || undefined,
          discordUrl: discordUrl.trim() || undefined,
        },
      });

      setResult(res as unknown as BulkInviteUsersResponse);
      toast.success(
        `Batch completed: ${(res as any).succeededCount} invitation(s) dispatched!`
      );
      data?.onSuccess?.();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to send invitations."
      );
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!bulkInviteMutation.isPending) {
          if (!isOpen) handleReset();
          onOpenChange(isOpen);
        }
      }}
      title="Bulk Invite Beta Testers"
      description="Send personalized welcome emails with secure activation links to onboard your beta testing cohort."
      size="xl"
    >
      <div className="space-y-5 py-2">
        {/* State 1: Input Form */}
        {!result ? (
          <>
            {/* Emails Input Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="bulk-emails" className="text-sm font-semibold flex items-center gap-1.5">
                  <Mail className="size-4 text-primary" />
                  Email List
                </Label>
                <div className="flex items-center gap-1.5">
                  <Badge variant={validEmails.length > 0 ? "default" : "secondary"}>
                    {validEmails.length} valid
                  </Badge>
                  {invalidEmails.length > 0 && (
                    <Badge variant="destructive">
                      {invalidEmails.length} invalid
                    </Badge>
                  )}
                </div>
              </div>

              <textarea
                id="bulk-emails"
                rows={5}
                value={rawEmails}
                onChange={(e) => setRawEmails(e.target.value)}
                placeholder="Paste emails separated by newline, comma, or space (e.g. from Google Sheets)&#10;alice@example.com&#10;bob@studio.cg, charlie@pipeline.org"
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-xs"
                disabled={bulkInviteMutation.isPending}
              />

              {invalidEmails.length > 0 && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3 shrink-0" />
                  Unrecognized format: {invalidEmails.slice(0, 3).join(", ")}
                  {invalidEmails.length > 3 && ` and ${invalidEmails.length - 3} more`}
                </p>
              )}

              <p className="text-[11px] text-muted-foreground">
                Duplicates are automatically filtered. Each tester receives a unique token valid for 7 days to set their password.
              </p>
            </div>

            {/* Role & Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-role" className="text-xs font-medium">
                  Assign System Role
                </Label>
                <select
                  id="bulk-role"
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  disabled={isRolesLoading || bulkInviteMutation.isPending}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Default Member (User)</option>
                  {roleOptions?.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bulk-discord" className="text-xs font-medium flex items-center justify-between">
                  <span>Community Discord Link</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Optional</span>
                </Label>
                <Input
                  id="bulk-discord"
                  type="url"
                  placeholder="https://discord.gg/your-server"
                  value={discordUrl}
                  onChange={(e) => setDiscordUrl(e.target.value)}
                  disabled={bulkInviteMutation.isPending}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Founder Note */}
            <div className="space-y-1.5">
              <Label htmlFor="bulk-note" className="text-xs font-medium flex items-center justify-between">
                <span>Personal Note from Founder</span>
                <span className="text-[10px] text-muted-foreground font-normal">Optional</span>
              </Label>
              <textarea
                id="bulk-note"
                rows={2}
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                placeholder="Hi! Thanks for helping us test the new Blender headless runner and S3 zero-byte pipeline..."
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={bulkInviteMutation.isPending}
              />
            </div>

            {/* Form Actions Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                onPress={handleClose}
                isDisabled={bulkInviteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onPress={handleSubmit}
                isDisabled={validEmails.length === 0 || bulkInviteMutation.isPending}
                className="gap-2"
              >
                <Send className="size-4" />
                {bulkInviteMutation.isPending
                  ? "Dispatching Invitations..."
                  : `Send ${validEmails.length} Invitation(s)`}
              </Button>
            </div>
          </>
        ) : (
          /* State 2: Results Overview */
          <div className="space-y-4">
            {/* Metric Cards */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border bg-muted/40 p-3">
                <span className="text-xs text-muted-foreground">Processed</span>
                <p className="text-lg font-bold">{result.totalProcessed}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <span className="text-xs text-emerald-500 font-medium">Invited</span>
                <p className="text-lg font-bold text-emerald-500">
                  {result.succeededCount}
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <span className="text-xs text-amber-500 font-medium">Existing</span>
                <p className="text-lg font-bold text-amber-500">
                  {result.skippedExistingCount}
                </p>
              </div>
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <span className="text-xs text-destructive font-medium">Failed</span>
                <p className="text-lg font-bold text-destructive">
                  {result.failedCount}
                </p>
              </div>
            </div>

            {/* Results Details List */}
            <div className="rounded-md border bg-card max-h-60 overflow-y-auto divide-y text-xs">
              {result.details?.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 hover:bg-muted/30"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {item.success ? (
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    ) : item.isExistingUser ? (
                      <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                    ) : (
                      <AlertCircle className="size-4 text-destructive shrink-0" />
                    )}
                    <span className="font-mono truncate">{item.email}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground text-[11px]">
                      {item.reason}
                    </span>
                    <Badge
                      variant={
                        item.success
                          ? "default"
                          : item.isExistingUser
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {item.success
                        ? "Sent"
                        : item.isExistingUser
                        ? "Already Registered"
                        : "Error"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Done / Invite More Footer */}
            <div className="flex items-center justify-between pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                onPress={handleReset}
                className="gap-1.5 text-xs text-muted-foreground"
              >
                <RotateCcw className="size-3.5" />
                Invite Another Batch
              </Button>
              <Button onPress={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </BaseDialog>
  );
}
