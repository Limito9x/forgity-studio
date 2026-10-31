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
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  RefreshCw,
  FolderCheck,
  CheckCircle2,
  HardDrive,
  Cpu,
  Loader2,
  Plus,
  FolderGit2,
  Sparkles,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { usePipelines } from "@/features/pipelines/hooks/usePipelines";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import { PipelineTriggerType } from "@/gen/model";
import { cn } from "@/lib/utils";

interface RepositorySyncTabProps {
  projectId?: string;
  repositoryId: string;
  repositoryName: string;
  runners: RepositoryRunnerDto[];
  onAttachRunner: () => void;
  onSyncSuccess?: () => void;
}

interface MatchedPipeline {
  id: string;
  name: string;
  matchingCount: number;
  extensions: string[];
}

export function RepositorySyncTab({
  projectId,
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
    if (
      runners.length > 0 &&
      (!selectedRunnerId || !runners.some((r) => r.runnerId === selectedRunnerId))
    ) {
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

  // 1. Content Types & Smart Content Link
  const { data: contentTypesData } = useContentTypes(
    { page: 1, pageSize: 100 } as any,
    projectId
  );
  const contentTypes = useMemo(() => contentTypesData?.items ?? [], [contentTypesData]);

  const [isSmartLinkEnabled, setIsSmartLinkEnabled] = useState(false);
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>("");

  // Restore saved ContentType for this repository from localStorage
  useEffect(() => {
    if (!repositoryId) return;
    const saved = localStorage.getItem(`forgity_sync_content_type_${repositoryId}`);
    if (saved) {
      setSelectedContentTypeId(saved);
      setIsSmartLinkEnabled(true);
    }
  }, [repositoryId]);

  const handleContentTypeChange = (typeId?: string) => {
    const validId = typeId || "";
    setSelectedContentTypeId(validId);
    if (validId) {
      localStorage.setItem(`forgity_sync_content_type_${repositoryId}`, validId);
    } else {
      localStorage.removeItem(`forgity_sync_content_type_${repositoryId}`);
    }
  };

  // 2. Fetch Project Pipelines for Trigger Detection
  const { data: pipelines = [] } = usePipelines(projectId);

  // Selected diff items
  const selectedItems = useMemo(
    () => diffItems.filter((i) => selectedPaths.has(i.relativePath)),
    [diffItems, selectedPaths]
  );

  // Match Pipelines against selected files and repository scoping
  const { alwaysPipelines, askBeforePipelines } = useMemo(() => {
    const alwaysPipelines: MatchedPipeline[] = [];
    const askBeforePipelines: MatchedPipeline[] = [];

    if (selectedItems.length === 0 || !repositoryId) {
      return { alwaysPipelines, askBeforePipelines };
    }

    for (const pipeline of pipelines) {
      // Check trigger type
      const isEventTrigger =
        pipeline.triggerType === PipelineTriggerType.OnResourceCreated ||
        pipeline.triggerType === PipelineTriggerType.OnResourceVersionUpdated ||
        (pipeline.triggerType as any) === 1 ||
        (pipeline.triggerType as any) === 2 ||
        (pipeline.triggerType as any) === "OnResourceCreated" ||
        (pipeline.triggerType as any) === "OnResourceVersionUpdated";

      if (!isEventTrigger) continue;

      const cfg =
        pipeline.triggerConfig && typeof pipeline.triggerConfig === "object"
          ? (pipeline.triggerConfig as Record<string, any>)
          : {};

      // Check repository scope: allowAllRepositories or repositoryIds includes current repositoryId
      const allowAll = cfg.allowAllRepositories === true;
      const repoIds: string[] = Array.isArray(cfg.repositoryIds)
        ? cfg.repositoryIds
        : typeof cfg.repositoryId === "string" && cfg.repositoryId.trim()
          ? [cfg.repositoryId.trim()]
          : [];

      const isRepoMatched =
        allowAll || repoIds.some((id) => id.toLowerCase() === repositoryId.toLowerCase());

      if (!isRepoMatched) continue;

      // Extract pipeline file extensions
      let pipelineExts: string[] = [];
      if (Array.isArray(cfg.extensions)) {
        pipelineExts = cfg.extensions
          .map((e: string) => e.replace(/^\.+/, "").toLowerCase().trim())
          .filter(Boolean);
      } else if (typeof cfg.extensions === "string" && cfg.extensions.trim()) {
        pipelineExts = [cfg.extensions.replace(/^\.+/, "").toLowerCase().trim()];
      } else if (typeof cfg.extension === "string" && cfg.extension.trim()) {
        pipelineExts = [cfg.extension.replace(/^\.+/, "").toLowerCase().trim()];
      }

      // Count matching files in selected items
      let matchingCount = 0;
      for (const item of selectedItems) {
        if (item.status === "deleted" || item.status === "missing") continue;
        const dot = item.relativePath.lastIndexOf(".");
        const ext = dot !== -1 ? item.relativePath.slice(dot + 1).toLowerCase() : "";
        if (pipelineExts.length === 0 || pipelineExts.includes(ext)) {
          matchingCount++;
        }
      }

      if (matchingCount === 0) continue;

      const mode = cfg.triggerMode === "AskBefore" ? "AskBefore" : "Always";
      const entry: MatchedPipeline = {
        id: pipeline.id,
        name: pipeline.name,
        matchingCount,
        extensions: pipelineExts,
      };

      if (mode === "AskBefore") {
        askBeforePipelines.push(entry);
      } else {
        alwaysPipelines.push(entry);
      }
    }

    return { alwaysPipelines, askBeforePipelines };
  }, [pipelines, repositoryId, selectedItems]);

  // Track approved AskBefore pipeline IDs (default checked when newly matched)
  const [approvedAskBeforeIds, setApprovedAskBeforeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (askBeforePipelines.length > 0) {
      setApprovedAskBeforeIds((prev) => {
        const next = new Set(prev);
        for (const p of askBeforePipelines) {
          next.add(p.id);
        }
        return next;
      });
    }
  }, [askBeforePipelines]);

  const handleToggleApprovePipeline = (pipelineId: string) => {
    setApprovedAskBeforeIds((prev) => {
      const next = new Set(prev);
      if (next.has(pipelineId)) {
        next.delete(pipelineId);
      } else {
        next.add(pipelineId);
      }
      return next;
    });
  };

  const totalQueuedJobs = useMemo(() => {
    let count = 0;
    for (const p of alwaysPipelines) {
      count += p.matchingCount;
    }
    for (const p of askBeforePipelines) {
      if (approvedAskBeforeIds.has(p.id)) {
        count += p.matchingCount;
      }
    }
    return count;
  }, [alwaysPipelines, askBeforePipelines, approvedAskBeforeIds]);

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
          setSelectedPaths(
            new Set(autoSelectable.length > 0 ? autoSelectable : items.map((i) => i.relativePath))
          );

          toast.success(
            `Scanned ${items.length} file changes on ${activeRunner?.runner?.name || "runner"}`
          );
        },
        onError: (err: any) => {
          toast.error(
            err?.response?.data?.message || err?.message || "Failed to scan local changes"
          );
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
      toast.error("Please select at least one file to register");
      return;
    }

    const pathsToSync = Array.from(selectedPaths);
    const approvedList = Array.from(approvedAskBeforeIds).filter((id) =>
      askBeforePipelines.some((p) => p.id === id)
    );

    syncMutation.mutate(
      {
        data: {
          repositoryId,
          runnerId: selectedRunnerId,
          targetPaths: pathsToSync,
          notes: null,
          approvedPipelineIds: approvedList.length > 0 ? approvedList : undefined,
          contentTypeId:
            isSmartLinkEnabled && selectedContentTypeId ? selectedContentTypeId : undefined,
        } as any,
      },
      {
        onSuccess: (res: any) => {
          const added = res.addedCount ?? 0;
          const modified = res.modifiedCount ?? 0;
          const smartLinked = res.smartLinkedCount ?? 0;

          let msg = `Registered successfully as Draft! Added: ${added}, Updated: ${modified}`;
          if (smartLinked > 0) {
            msg += ` • ${smartLinked} file(s) smart linked to Content`;
          }
          if (totalQueuedJobs > 0) {
            msg += ` • Queued ${totalQueuedJobs} pipeline jobs`;
          }
          toast.success(msg);

          // Re-scan to update diff list after register
          handleScan(selectedRunnerId);
          onSyncSuccess?.();
        },
        onError: (err: any) => {
          toast.error(
            err?.response?.data?.message || err?.message || "Failed to register changes"
          );
        },
      }
    );
  };

  const counts = useMemo(() => {
    const added = diffItems.filter((i) => i.status === "added").length;
    const modified = diffItems.filter((i) => i.status === "modified").length;
    const missing = diffItems.filter(
      (i) => i.status === "missing" || i.status === "deleted"
    ).length;
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
            <h3 className="text-base font-semibold text-foreground">
              No Compute Runners Attached
            </h3>
            <p className="text-xs text-muted-foreground">
              To discover and synchronize local files into this repository, attach a physical
              runner machine with a designated root folder.
            </p>
          </div>
          <Button
            onClick={onAttachRunner}
            size="sm"
            className="gap-1.5 cursor-pointer text-xs"
          >
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
                <span className="text-xs font-semibold text-foreground">
                  Active Runner:
                </span>
                {runners.length > 1 ? (
                  <Select
                    selectedKey={selectedRunnerId}
                    onSelectionChange={(key) => {
                      setSelectedRunnerId(key as string);
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
                    {activeRunner?.runner?.name ||
                      activeRunner?.runner?.machineKey ||
                      "Runner Machine"}
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
                    className={`size-1.5 rounded-full mr-1 ${
                      isRunnerOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                    }`}
                  />
                  {isRunnerOnline ? "Online" : "Offline"}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                <HardDrive className="size-3 text-primary/70 shrink-0" />
                <span
                  className="font-mono text-[11px] truncate"
                  title={activeRunner?.rootPath}
                >
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
              <p className="text-sm font-semibold text-foreground">
                Inspecting Runner Filesystem
              </p>
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
              <h4 className="text-sm font-semibold text-foreground">
                Ready to Detect Changes
              </h4>
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
              <h4 className="text-sm font-semibold text-foreground">
                Everything is Up-to-Date!
              </h4>
              <p className="text-xs text-muted-foreground">
                No new, modified, or missing files were detected in the runner directory. All files
                match the repository version.
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
                <Badge
                  variant="outline"
                  className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[11px]"
                >
                  +{counts.added} New
                </Badge>
              )}
              {counts.modified > 0 && (
                <Badge
                  variant="outline"
                  className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-[11px]"
                >
                  ~{counts.modified} Modified
                </Badge>
              )}
              {counts.missing > 0 && (
                <Badge
                  variant="outline"
                  className="text-rose-500 border-rose-500/30 bg-rose-500/10 text-[11px]"
                >
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

          {/* Section 1: Smart Content Link (Content Anchor Tree) */}
          <Card className="rounded-2xl border-border/60 bg-card p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      Smart Content Link (Anchor Tree)
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 h-4 border-primary/30 text-primary"
                    >
                      Convention-Based
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Auto-matches filenames (e.g. <code>Eva_Outfit1_Bra.fbx</code> &rarr;{" "}
                    <strong>Eva</strong>, <code>outfit1/bra</code>) and links them to Content Items
                    upon sync.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                <span className="text-xs text-muted-foreground font-medium">Enable</span>
                <Switch
                  isSelected={isSmartLinkEnabled}
                  onChange={(checked) => {
                    setIsSmartLinkEnabled(checked);
                    if (!checked) {
                      handleContentTypeChange("");
                    } else if (contentTypes.length > 0 && !selectedContentTypeId && contentTypes[0].id) {
                      handleContentTypeChange(contentTypes[0].id);
                    }
                  }}
                />
              </div>
            </div>

            {isSmartLinkEnabled && (
              <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="text-xs font-medium text-foreground whitespace-nowrap">
                  Target Content Type:
                </label>
                {contentTypes.length > 0 ? (
                  <Select
                    selectedKey={selectedContentTypeId}
                    onSelectionChange={(key) => handleContentTypeChange(key as string)}
                    className="w-full sm:w-72"
                  >
                    <SelectTrigger className="h-8 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contentTypes.map((type) => (
                        <SelectItem key={type.id} id={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    No Content Types defined in this project.
                  </span>
                )}
              </div>
            )}
          </Card>

          {/* Section 2: Automated Pipeline Triggers (Per-Resource Queue) */}
          {(alwaysPipelines.length > 0 || askBeforePipelines.length > 0) && (
            <Card className="rounded-2xl border-border/60 bg-card p-4 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <Zap className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-foreground">
                        Automated Pipeline Triggers
                      </h4>
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 h-4 border-amber-500/30 text-amber-500 font-mono"
                      >
                        Per-Resource Queue (1 File = 1 Run)
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Pipelines matching selected file types and repository scope will be queued upon registration.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2.1 Always Active Triggers */}
              {alwaysPipelines.length > 0 && (
                <div className="space-y-1.5 rounded-xl bg-muted/30 p-2.5 border border-border/40">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                    <Zap className="size-3 text-emerald-500" />
                    <span>Automatic Execution (Always):</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    {alwaysPipelines.map((p) => (
                      <Badge
                        key={p.id}
                        variant="outline"
                        className="text-xs py-1 px-2.5 gap-1.5 bg-background border-border text-foreground font-normal"
                      >
                        <span className="font-semibold text-foreground">{p.name}</span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                          ({p.matchingCount} {p.matchingCount === 1 ? "file" : "files"})
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 2.2 Requires Approval (AskBefore) */}
              {askBeforePipelines.length > 0 && (
                <div className="space-y-2 rounded-xl bg-amber-500/5 p-2.5 border border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                      <AlertTriangle className="size-3 text-amber-500" />
                      <span>Interactive Approval Required (AskBefore):</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Select pipelines to trigger
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    {askBeforePipelines.map((p) => {
                      const isApproved = approvedAskBeforeIds.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className={cn(
                            "flex items-center gap-2.5 p-2 rounded-lg border transition-all cursor-pointer select-none text-xs",
                            isApproved
                              ? "bg-background border-amber-500/40 shadow-xs"
                              : "bg-muted/20 border-border/40 opacity-70 hover:opacity-100"
                          )}
                        >
                          <Checkbox
                            isSelected={isApproved}
                            onChange={() => handleToggleApprovePipeline(p.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-medium truncate">{p.name}</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 h-4 font-mono shrink-0"
                              >
                                {p.matchingCount} {p.matchingCount === 1 ? "file" : "files"}
                              </Badge>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Section 3: Bottom Register Action Bar */}
          <Card className="rounded-2xl border-border/60 bg-card p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground min-w-0">
                <FolderCheck className="size-4 text-primary shrink-0" />
                <span className="truncate">
                  Registered files will be indexed into the catalog as{" "}
                  <strong className="text-foreground">Draft (v1)</strong> for pipeline testing.
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                <Button
                  onClick={handleSync}
                  isDisabled={syncMutation.isPending || selectedPaths.size === 0}
                  className="gap-2 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 px-4 w-full sm:w-auto font-medium"
                >
                  {syncMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Registering Files...</span>
                    </>
                  ) : (
                    <>
                      <FolderCheck className="size-3.5" />
                      <span>
                        Register Selected ({selectedPaths.size}) as Draft
                        {totalQueuedJobs > 0 && ` • ⚡ ${totalQueuedJobs} Jobs`}
                      </span>
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
