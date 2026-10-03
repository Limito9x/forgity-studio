import { useState, useMemo, useEffect } from "react";
import {
  useCompareRepositoryResources,
  useSyncLocalChanges,
  type RepositoryRunnerDto,
} from "../hooks/useRepositories";
import {
  LocalChangesTable,
  type DiffItemWithStatus,
  type DiffStatus,
} from "./LocalChangesTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  HardDrive,
  Cpu,
  Loader2,
  Plus,
  FolderGit2,
} from "lucide-react";

interface RepositorySyncTabProps {
  repositoryId: string;
  repositoryName: string;
  runners: RepositoryRunnerDto[];
  onAttachRunner: () => void;
  onSyncSuccess?: () => void;
}

export function RepositorySyncTab({
  repositoryId,
  repositoryName: _repositoryName,
  runners,
  onAttachRunner,
  onSyncSuccess,
}: RepositorySyncTabProps) {
  const [selectedRunnerId, setSelectedRunnerId] = useState<string>(
    runners[0]?.runnerId || ""
  );

  useEffect(() => {
    if (runners.length > 0 && (!selectedRunnerId || !runners.some((r) => r.runnerId === selectedRunnerId))) {
      setSelectedRunnerId(runners[0].runnerId);
    }
  }, [runners, selectedRunnerId]);

  const activeRunner = useMemo(
    () => runners.find((r) => r.runnerId === selectedRunnerId) || runners[0],
    [runners, selectedRunnerId]
  );

  const compareMutation = useCompareRepositoryResources();
  const syncMutation = useSyncLocalChanges(repositoryId);

  const [diffItems, setDiffItems] = useState<DiffItemWithStatus[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<"all" | DiffStatus>("all");
  const [notes, setNotes] = useState("");

  const handleScan = (runnerIdToScan?: string) => {
    const targetRunnerId = runnerIdToScan || selectedRunnerId;
    if (!repositoryId || !targetRunnerId) {
      toast.error("Please select a runner to scan");
      return;
    }

    compareMutation.mutate(
      {
        data: {
          repositoryId,
          runnerId: targetRunnerId,
        },
      },
      {
        onSuccess: (res) => {
          const items: DiffItemWithStatus[] = [];
          (res.added || []).forEach((item) =>
            items.push({ ...item, status: "added" })
          );
          (res.modified || []).forEach((item) =>
            items.push({ ...item, status: "modified" })
          );
          (res.missing || []).forEach((item) =>
            items.push({ ...item, status: "missing" })
          );
          (res.deleted || []).forEach((item) =>
            items.push({ ...item, status: "deleted" })
          );

          setDiffItems(items);
          setHasScanned(true);

          // Auto-select non-deleted items by default
          const autoSelectable = items
            .filter((i) => i.status !== "deleted" && i.status !== "missing")
            .map((i) => i.relativePath);
          setSelectedPaths(new Set(autoSelectable.length > 0 ? autoSelectable : items.map((i) => i.relativePath)));

          toast.success(
            `Scanned ${items.length} file changes on ${activeRunner?.runner?.name || "runner"}`
          );
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err?.message || "Failed to scan local changes");
        },
      }
    );
  };

  const handleToggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedPaths.size === diffItems.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(diffItems.map((i) => i.relativePath)));
    }
  };

  const handleSync = () => {
    if (selectedPaths.size === 0) {
      toast.error("Please select at least one file to synchronize");
      return;
    }

    const pathsToSync = Array.from(selectedPaths);
    syncMutation.mutate(
      {
        data: {
          repositoryId,
          runnerId: selectedRunnerId,
          targetPaths: pathsToSync,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: (res) => {
          toast.success(
            `Synced successfully! Added: ${res.addedCount ?? 0}, Modified: ${res.modifiedCount ?? 0}`
          );
          setNotes("");
          // Re-scan to update diff list after sync
          handleScan(selectedRunnerId);
          onSyncSuccess?.();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.message || err?.message || "Failed to sync changes");
        },
      }
    );
  };

  const counts = useMemo(() => {
    const added = diffItems.filter((i) => i.status === "added").length;
    const modified = diffItems.filter((i) => i.status === "modified").length;
    const missing = diffItems.filter((i) => i.status === "missing" || i.status === "deleted").length;
    return { added, modified, missing, total: diffItems.length };
  }, [diffItems]);

  const isRunnerOnline = activeRunner?.runner?.isActive ?? true;

  if (runners.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed border-border/80 bg-card/60">
        <CardContent className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4">
          <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Cpu className="size-6" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base font-semibold text-foreground">No Compute Runners Attached</h3>
            <p className="text-xs text-muted-foreground">
              To discover and synchronize local files into this repository, attach a physical runner machine with a designated root folder.
            </p>
          </div>
          <Button onClick={onAttachRunner} size="sm" className="gap-1.5 cursor-pointer text-xs">
            <Plus className="size-3.5" /> Attach Runner Now
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Control Header Bar */}
      <Card className="rounded-2xl border-border/60 bg-card shadow-xs">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Runner Selector & Details */}
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Cpu className="size-5" />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">Active Runner:</span>
                {runners.length > 1 ? (
                  <Select
                    value={selectedRunnerId}
                    onChange={(value) => {
                      setSelectedRunnerId(value as string);
                      setHasScanned(false);
                      setDiffItems([]);
                    }}
                    className="w-64"
                  >
                    <SelectTrigger className="h-7 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {runners.map((r) => (
                        <SelectItem key={r.runnerId} id={r.runnerId}>
                          {r.runner?.name || r.runner?.machineKey}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs font-semibold text-foreground">
                    {activeRunner?.runner?.name || activeRunner?.runner?.machineKey || "Runner Machine"}
                  </span>
                )}

                <Badge
                  variant="outline"
                  className={
                    isRunnerOnline
                      ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px]"
                      : "text-muted-foreground border-border text-[10px]"
                  }
                >
                  <span
                    className={`size-1.5 rounded-full mr-1 ${isRunnerOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                      }`}
                  />
                  {isRunnerOnline ? "Online" : "Offline"}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                <HardDrive className="size-3 text-primary/70 shrink-0" />
                <span className="font-mono text-[11px] truncate" title={activeRunner?.rootPath}>
                  {activeRunner?.rootPath || "No root path specified"}
                </span>
                {activeRunner?.lastSyncAt && (
                  <span className="text-[10px] text-muted-foreground/80 shrink-0">
                    • Last synced: {new Date(activeRunner.lastSyncAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Scan Action */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={() => handleScan()}
              isDisabled={compareMutation.isPending || !isRunnerOnline}
              className="gap-2 cursor-pointer shadow-sm text-xs font-medium px-4 h-9"
            >
              {compareMutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Scanning Filesystem...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  <span>{hasScanned ? "Re-scan Runner" : "Scan Runner Directory"}</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Diff Area */}
      {compareMutation.isPending ? (
        <Card className="rounded-2xl border-border/60 bg-card/60 p-12 text-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Inspecting Runner Filesystem</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Comparing local file hashes and directory structure with repository database...
              </p>
            </div>
          </div>
        </Card>
      ) : !hasScanned ? (
        <Card className="rounded-2xl border-dashed border-border/70 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-3">
            <FolderGit2 className="size-10 text-muted-foreground mx-auto stroke-1" />
            <div className="space-y-1 max-w-md">
              <h4 className="text-sm font-semibold text-foreground">Ready to Detect Changes</h4>
              <p className="text-xs text-muted-foreground">
                Click <strong>"Scan Runner Directory"</strong> to compare the files on{" "}
                <span className="text-foreground font-medium">
                  {activeRunner?.runner?.name || activeRunner?.runner?.machineKey}
                </span>{" "}
                with your repository.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleScan()}
              isDisabled={!isRunnerOnline}
              className="gap-1.5 cursor-pointer text-xs mt-2"
            >
              <RefreshCw className="size-3.5 text-primary" /> Start Scan Now
            </Button>
          </CardContent>
        </Card>
      ) : diffItems.length === 0 ? (
        <Card className="rounded-2xl border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-3">
            <CheckCircle2 className="size-10 text-emerald-500 stroke-1" />
            <div className="space-y-1 max-w-md">
              <h4 className="text-sm font-semibold text-foreground">Everything is Up-to-Date!</h4>
              <p className="text-xs text-muted-foreground">
                No new, modified, or missing files were detected in the runner directory. All files match the repository version.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleScan()}
              className="gap-1.5 cursor-pointer text-xs mt-2"
            >
              <RefreshCw className="size-3.5" /> Check Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Diff Summary Badges */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Pending Changes:</span>
              {counts.added > 0 && (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[11px]">
                  +{counts.added} New
                </Badge>
              )}
              {counts.modified > 0 && (
                <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-[11px]">
                  ~{counts.modified} Modified
                </Badge>
              )}
              {counts.missing > 0 && (
                <Badge variant="outline" className="text-rose-500 border-rose-500/30 bg-rose-500/10 text-[11px]">
                  -{counts.missing} Missing
                </Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Selected <strong className="text-foreground">{selectedPaths.size}</strong> of{" "}
              {diffItems.length} changes
            </div>
          </div>

          {/* Full-width Diff Table */}
          <Card className="rounded-2xl border-border/60 bg-card overflow-hidden">
            <LocalChangesTable
              items={diffItems}
              selectedPaths={selectedPaths}
              filterStatus={filterStatus}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onFilterStatusChange={setFilterStatus}
            />
          </Card>

          {/* Bottom Commit & Sync Action Bar */}
          <Card className="rounded-2xl border-border/60 bg-card p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex-1 w-full min-w-0">
                <Input
                  placeholder="Sync note / commit memo (e.g., Update character textures, rigging fix)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                <Button
                  onClick={handleSync}
                  isDisabled={syncMutation.isPending || selectedPaths.size === 0}
                  className="gap-2 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 w-full sm:w-auto"
                >
                  {syncMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Synchronizing...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="size-3.5" />
                      <span>Synchronize Selected ({selectedPaths.size}) to Repository</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
