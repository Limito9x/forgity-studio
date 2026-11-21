import React, { useState } from "react";
import { useSystemStudios, useUpdateStudioQuota, type StudioAdminSummaryDto } from "../../hooks/useSystemStudios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { toast } from "sonner";
import {
  Building2,
  HardDrive,
  RefreshCw,
  Sliders,
  Search,
} from "lucide-react";

const PLAN_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Community", color: "bg-muted text-muted-foreground border-border" },
  1: { label: "Indie Pro", color: "bg-primary/10 text-primary border-primary/20" },
  2: { label: "Studio Team", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
};

export function SystemStudiosPage() {
  const { data: studios = [], isLoading, refetch } = useSystemStudios();
  const updateQuotaMutation = useUpdateStudioQuota();

  const [search, setSearch] = useState("");
  const [editingStudio, setEditingStudio] = useState<StudioAdminSummaryDto | null>(null);

  // Edit Dialog form state
  const [planTier, setPlanTier] = useState<number>(0);
  const [quotaMb, setQuotaMb] = useState<number>(200);

  const openEditDialog = (s: StudioAdminSummaryDto) => {
    setEditingStudio(s);
    setPlanTier(s.planTier);
    setQuotaMb(Math.round(s.studioManagedStorageQuotaBytes / (1024 * 1024)));
  };

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudio) return;

    try {
      await updateQuotaMutation.mutateAsync({
        id: editingStudio.id,
        planTier,
        studioManagedStorageQuotaBytes: quotaMb * 1024 * 1024,
      });
      toast.success(`Updated quota for "${editingStudio.name}"!`);
      setEditingStudio(null);
    } catch (err: any) {
      toast.error("Failed to update studio quota", { description: err?.message });
    }
  };

  const filteredStudios = studios.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Building2 className="h-6 w-6 text-primary" />
            <span>Studio Management</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Platform Administrator Control Plane: Monitor studio tenants, pipeline execution credits, and cloud storage allocations.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onPress={() => refetch()}
          className="gap-1.5"
          isDisabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search studios by name or slug..."
            className="pl-9 h-9"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {filteredStudios.length} of {studios.length} studios
        </div>
      </div>

      {/* Studios Table */}
      <div className="flex-1 rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60">
              <tr>
                <th className="px-4 py-3">Studio Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Plan Tier</th>
                <th className="px-4 py-3">Studio Cloud Storage</th>
                <th className="px-4 py-3">Projects</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading platform studios...
                  </td>
                </tr>
              ) : filteredStudios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    No studios found.
                  </td>
                </tr>
              ) : (
                filteredStudios.map((s) => {
                  const planInfo = PLAN_LABELS[s.planTier] || PLAN_LABELS[0];
                  const usedMb = Math.round(s.studioManagedStorageUsedBytes / (1024 * 1024));
                  const quotaMbVal = Math.round(s.studioManagedStorageQuotaBytes / (1024 * 1024));

                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {s.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {s.slug}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${planInfo.color}`}>
                          {planInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1.5 font-mono">
                          <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{usedMb} MB</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground">{quotaMbVal} MB</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {s.projectCount}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => openEditDialog(s)}
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                          Adjust Quota
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Quota Dialog */}
      {editingStudio && (
        <BaseDialog
          open={!!editingStudio}
          onOpenChange={(open) => !open && setEditingStudio(null)}
          title={`Adjust Quota: ${editingStudio.name}`}
          description="Update plan tier, allocate pipeline execution credits, or modify studio-managed cloud storage limits."
          className="max-w-md"
        >
          <form onSubmit={handleSaveQuota} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="adj-plan">Plan Tier</Label>
              <select
                id="adj-plan"
                value={planTier}
                onChange={(e) => setPlanTier(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={0}>Community (Free Preview)</option>
                <option value={1}>Indie Pro</option>
                <option value={2}>Studio Team</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-quota">Studio Cloud Storage Quota (MB)</Label>
              <Input
                id="adj-quota"
                type="number"
                min={50}
                value={quotaMb}
                onChange={(e) => setQuotaMb(Number(e.target.value))}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Applies only to platform-provided Studio Cloud storage (BYOS and local paths are exempt).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button type="button" variant="ghost" onPress={() => setEditingStudio(null)}>
                Cancel
              </Button>
              <Button type="submit" isDisabled={updateQuotaMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        </BaseDialog>
      )}
    </div>
  );
}
