import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Infinity as InfinityIcon,
  Laptop,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAdjustTemplateInstallationQuota,
  useGetTemplateInstallations,
} from "@/gen/endpoints/templates/templates";
import type { TemplateInstallationQuotaDto } from "@/gen/model";

interface TemplateQuotaManagementViewProps {
  templatePackageId?: string;
  templateTitle?: string;
  onBack: () => void;
}

const STATUS_BADGE_MAP: Record<
  string,
  { label: string; className: string }
> = {
  Active: {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  Unlimited: {
    label: "Unlimited",
    className: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  },
  Exhausted: {
    label: "Exhausted",
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  Revoked: {
    label: "Revoked",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

function formatRelativeDate(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function TemplateQuotaManagementView({
  templatePackageId,
  templateTitle,
  onBack,
}: TemplateQuotaManagementViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [editingItem, setEditingItem] =
    useState<TemplateInstallationQuotaDto | null>(null);
  const [customLimitInput, setCustomLimitInput] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const {
    data: installations = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetTemplateInstallations(
    templatePackageId ? { templatePackageId } : undefined
  );

  const adjustMutation = useAdjustTemplateInstallationQuota();

  const stats = useMemo(() => {
    const total = installations.length;
    const totalRuns = installations.reduce((acc, x) => acc + x.usedRuns, 0);
    const exhausted = installations.filter(
      (x) => x.status === "Exhausted"
    ).length;
    const revoked = installations.filter((x) => x.status === "Revoked").length;
    return { total, totalRuns, exhausted, revoked };
  }, [installations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return installations.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.machineKey.toLowerCase().includes(q) ||
        (item.machineName || "").toLowerCase().includes(q) ||
        (item.ownerEmail || "").toLowerCase().includes(q) ||
        item.templateTitle.toLowerCase().includes(q)
      );
    });
  }, [installations, search, statusFilter]);

  const handleAdjust = async (
    libraryItemId: string,
    action: 0 | 1 | 2 | 3 | 4 | 5,
    amount?: number,
    successMessage?: string
  ) => {
    try {
      await adjustMutation.mutateAsync({
        libraryItemId,
        data: { action, amount: amount ?? null },
      });
      await refetch();
      toast.success(successMessage || "Quota updated successfully");
    } catch (err: any) {
      toast.error("Failed to update quota", {
        description: err?.message || "Unexpected error",
      });
    }
  };

  const handleCopyMachineKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <Button
            size="sm"
            variant="ghost"
            onPress={onBack}
            className="mt-0.5 h-8 px-2 text-xs"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {templateTitle
                ? `Workstation Quotas: ${templateTitle}`
                : "All Workstation Template Quotas"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitor forked workstations, linked user identities, and manage
              run limits or access revocation.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onPress={() => refetch()}
          isDisabled={isFetching}
          className="h-8 text-xs gap-1.5"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              Forked Workstations
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              Total Executed Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{stats.totalRuns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              Exhausted Quota
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold text-amber-600">
              {stats.exhausted}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              Revoked Access
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold text-destructive">
              {stats.revoked}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user email, machine name, or machineKey..."
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(["ALL", "Active", "Exhausted", "Unlimited", "Revoked"] as const).map(
            (st) => (
              <Button
                key={st}
                size="sm"
                variant={statusFilter === st ? "default" : "outline"}
                onPress={() => setStatusFilter(st)}
                className="h-7 px-2.5 text-[11px]"
              >
                {st === "ALL" ? "All" : st}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Installations Table */}
      {isLoading ? (
        <div className="flex h-52 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-xl p-6 text-center bg-muted/20">
          <Laptop className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">No workstation installations found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Workstations appear here automatically once users fork or run this template.
          </p>
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">User Identity</th>
                  <th className="text-left font-medium px-4 py-2.5">Workstation</th>
                  {!templatePackageId && (
                    <th className="text-left font-medium px-4 py-2.5">Template</th>
                  )}
                  <th className="text-left font-medium px-4 py-2.5">Quota Usage</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Last Run</th>
                  <th className="text-right font-medium px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((item) => {
                  const statusMeta =
                    STATUS_BADGE_MAP[item.status] || STATUS_BADGE_MAP.Active;
                  const pct =
                    item.maxRuns && item.maxRuns > 0
                      ? Math.min(100, Math.round((item.usedRuns / item.maxRuns) * 100))
                      : 0;
                  const isEditingThis = editingItem?.libraryItemId === item.libraryItemId;

                  return (
                    <tr key={item.libraryItemId} className="hover:bg-muted/20">
                      {/* User Identity */}
                      <td className="px-4 py-3 align-top">
                        {item.ownerEmail || item.ownerUserId ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <Mail className="h-3 w-3 text-primary shrink-0" />
                              <span>{item.ownerEmail || "Signed-in User"}</span>
                            </div>
                            {item.ownerUserId && (
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {item.ownerUserId.slice(0, 8)}...
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Anonymous Workstation
                          </span>
                        )}
                      </td>

                      {/* Workstation */}
                      <td className="px-4 py-3 align-top space-y-1">
                        <div className="font-medium text-foreground">
                          {item.machineName || "Unnamed Workstation"}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                            {item.machineKey.length > 18
                              ? `${item.machineKey.slice(0, 18)}...`
                              : item.machineKey}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyMachineKey(item.machineKey)}
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Copy MachineKey"
                          >
                            {copiedKey === item.machineKey ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                        {(item.osPlatform || item.appVersion) && (
                          <div className="text-[10px] text-muted-foreground">
                            {[item.osPlatform, item.appVersion ? `v${item.appVersion}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>

                      {!templatePackageId && (
                        <td className="px-4 py-3 align-top font-medium">
                          {item.templateTitle}
                        </td>
                      )}

                      {/* Quota Usage */}
                      <td className="px-4 py-3 align-top min-w-[160px]">
                        <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                          <span>
                            {item.usedRuns} /{" "}
                            {item.maxRuns !== null && item.maxRuns !== undefined
                              ? item.maxRuns
                              : "∞"}
                          </span>
                          {item.remainingRuns !== null &&
                            item.remainingRuns !== undefined && (
                              <span className="text-muted-foreground">
                                ({item.remainingRuns} left)
                              </span>
                            )}
                        </div>
                        {item.maxRuns !== null && item.maxRuns !== undefined && (
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                item.status === "Exhausted"
                                  ? "bg-amber-500"
                                  : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 align-top">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </Badge>
                      </td>

                      {/* Last Run */}
                      <td className="px-4 py-3 align-top text-muted-foreground text-[11px]">
                        <div>{formatRelativeDate(item.lastRunAt)}</div>
                        <div className="text-[10px] opacity-75">
                          Added: {formatRelativeDate(item.addedAt)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 align-top text-right">
                        <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            isDisabled={adjustMutation.isPending}
                            onPress={() =>
                              handleAdjust(
                                item.libraryItemId,
                                0,
                                10,
                                "Added +10 credits"
                              )
                            }
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            10
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            isDisabled={adjustMutation.isPending}
                            onPress={() =>
                              handleAdjust(
                                item.libraryItemId,
                                0,
                                50,
                                "Added +50 credits"
                              )
                            }
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            50
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            isDisabled={adjustMutation.isPending}
                            onPress={() => {
                              if (isEditingThis) {
                                setEditingItem(null);
                              } else {
                                setEditingItem(item);
                                setCustomLimitInput(
                                  item.maxRuns !== null && item.maxRuns !== undefined
                                    ? String(item.maxRuns)
                                    : ""
                                );
                              }
                            }}
                          >
                            <SlidersHorizontal className="h-3 w-3 mr-1" />
                            Limit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            isDisabled={adjustMutation.isPending}
                            onPress={() =>
                              handleAdjust(
                                item.libraryItemId,
                                3,
                                undefined,
                                "Reset used runs to 0"
                              )
                            }
                            aria-label="Reset usage"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-7 px-2 text-[11px] ${
                              item.isRevoked
                                ? "text-emerald-600 hover:text-emerald-700"
                                : "text-destructive hover:text-destructive"
                            }`}
                            isDisabled={adjustMutation.isPending}
                            onPress={() =>
                              handleAdjust(
                                item.libraryItemId,
                                item.isRevoked ? 5 : 4,
                                undefined,
                                item.isRevoked
                                  ? "Restored workstation access"
                                  : "Revoked workstation access"
                              )
                            }
                          >
                            {item.isRevoked ? (
                              <>
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Restore
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="h-3 w-3 mr-1" />
                                Revoke
                              </>
                            )}
                          </Button>
                        </div>

                        {isEditingThis && (
                          <div className="mt-2 p-2.5 rounded-lg border border-border bg-muted/40 flex items-center justify-end gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              value={customLimitInput}
                              onChange={(e) => setCustomLimitInput(e.target.value)}
                              placeholder="Max runs"
                              className="h-7 w-24 text-xs"
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-[11px]"
                              isDisabled={adjustMutation.isPending}
                              onPress={async () => {
                                const parsed = Number.parseInt(customLimitInput, 10);
                                if (Number.isNaN(parsed) || parsed < 0) {
                                  toast.error("Please enter a valid non-negative integer");
                                  return;
                                }
                                await handleAdjust(
                                  item.libraryItemId,
                                  1,
                                  parsed,
                                  `Set limit to ${parsed} runs`
                                );
                                setEditingItem(null);
                              }}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              isDisabled={adjustMutation.isPending}
                              onPress={async () => {
                                await handleAdjust(
                                  item.libraryItemId,
                                  2,
                                  undefined,
                                  "Set quota to Unlimited"
                                );
                                setEditingItem(null);
                              }}
                            >
                              <InfinityIcon className="h-3 w-3 mr-1" />
                              Unlimited
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
