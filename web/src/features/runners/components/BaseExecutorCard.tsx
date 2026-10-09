import React, { useState, useEffect, useMemo } from "react";
import { getSoftwareMetadata } from "../constants/dccEngines";
import { EXECUTOR_EXTENSIONS } from "./ExecutorExtensions";
import type { ExecutorCandidateDto, RunnerExecutorConfigDto } from "../types";
import { useScanRunnerExecutors } from "../hooks/useRunners";
import { RemoteFileBrowserDialog } from "@/components/custom-ui/file-tree";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Layers,
  FolderOpen,
  Copy,
  Check,
  Save,
  AlertCircle,
  ChevronDown,
  Radar,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export interface BaseExecutorCardProps {
  runnerId?: string;
  runnerName?: string;
  executorKey: string;
  defaultCandidate?: ExecutorCandidateDto;
  activeConfig?: RunnerExecutorConfigDto;
  availableCandidates: ExecutorCandidateDto[];
  defaultExpanded?: boolean;
  onOpenBrowse?: (
    initialPath: string,
    onSelect: (selectedPath: string) => void
  ) => void;
  onSave: (payload: {
    executorKey: string;
    executablePath: string;
    version: string | null;
    isEnabled: boolean;
    settings: Record<string, any>;
  }) => void;
  isSaving?: boolean;
}

export function BaseExecutorCard({
  runnerId,
  runnerName,
  executorKey,
  defaultCandidate,
  activeConfig,
  availableCandidates,
  defaultExpanded,
  onOpenBrowse,
  onSave,
  isSaving = false,
}: BaseExecutorCardProps) {
  const meta = getSoftwareMetadata(executorKey);
  const isConfigured = !!activeConfig?.executablePath;

  // Collapsible State (Mặc định mở nếu đã cấu hình hoặc được chỉ định)
  const [isExpanded, setIsExpanded] = useState<boolean>(
    defaultExpanded ?? isConfigured
  );

  // Form State
  const [executablePath, setExecutablePath] = useState<string>(
    activeConfig?.executablePath || defaultCandidate?.executablePath || ""
  );
  const [version, setVersion] = useState<string>(
    activeConfig?.version || defaultCandidate?.version || ""
  );
  const [isEnabled, setIsEnabled] = useState<boolean>(
    activeConfig?.isEnabled ?? true
  );

  // Settings State (Extension specific)
  const [settings, setSettings] = useState<Record<string, any>>(
    (activeConfig?.settings as any) || {}
  );

  // Candidates list (có thể cập nhật thêm khi bấm Detect riêng)
  const [candidates, setCandidates] = useState<ExecutorCandidateDto[]>(
    availableCandidates
  );

  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [browseBinaryOpen, setBrowseBinaryOpen] = useState<boolean>(false);

  const scanMutation = useScanRunnerExecutors();

  // Re-sync form state only when activeConfig id changes or when form is not dirty
  const lastConfigIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const configId = activeConfig?.id || null;
    const isNewConfig = configId !== lastConfigIdRef.current;

    if (isNewConfig) {
      lastConfigIdRef.current = configId;
      if (activeConfig) {
        setExecutablePath(activeConfig.executablePath || "");
        setVersion(activeConfig.version || "");
        setIsEnabled(activeConfig.isEnabled ?? true);
        setSettings((activeConfig.settings as Record<string, any>) || {});
      } else if (defaultCandidate) {
        setExecutablePath(defaultCandidate.executablePath || "");
        setVersion(defaultCandidate.version || "");
        setIsEnabled(true);
        setSettings({});
      }
    }
  }, [activeConfig, defaultCandidate]);

  useEffect(() => {
    setCandidates(availableCandidates);
  }, [availableCandidates]);

  // Check if current form inputs differ from saved server configuration
  const isDirty = useMemo(() => {
    const origPath = activeConfig?.executablePath || "";
    const origVersion = activeConfig?.version || "";
    const origEnabled = activeConfig?.isEnabled ?? true;
    const origSettings = (activeConfig?.settings as Record<string, any>) || {};

    return (
      executablePath !== origPath ||
      version !== origVersion ||
      isEnabled !== origEnabled ||
      JSON.stringify(settings) !== JSON.stringify(origSettings)
    );
  }, [activeConfig, executablePath, version, isEnabled, settings]);

  const allCandidates = useMemo(() => {
    const list = [...candidates];
    if (activeConfig?.executablePath) {
      const exists = list.some(
        (c) => c.executablePath.toLowerCase() === activeConfig.executablePath.toLowerCase()
      );
      if (!exists) {
        list.unshift({
          executorKey,
          executablePath: activeConfig.executablePath,
          version: activeConfig.version || "active",
        });
      }
    }
    return list;
  }, [candidates, activeConfig, executorKey]);

  const handleCopyPath = async () => {
    if (!executablePath) return;
    try {
      await navigator.clipboard.writeText(executablePath);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast.success("Executable path copied");
    } catch {
      toast.error("Failed to copy path");
    }
  };

  const handleBrowse = () => {
    if (onOpenBrowse) {
      onOpenBrowse(executablePath, (newPath) => {
        setExecutablePath(newPath);
      });
    } else {
      setBrowseBinaryOpen(true);
    }
  };

  const handleSelectCandidate = (candidate: ExecutorCandidateDto) => {
    setExecutablePath(candidate.executablePath);
    if (candidate.version) setVersion(candidate.version);
    toast.info(`Selected ${candidate.version ? `v${candidate.version}` : "binary"} candidate`);
  };

  // Quét riêng executor này trên máy runner
  const handleDetect = () => {
    if (!runnerId) return;

    scanMutation.mutate(
      {
        runnerId,
        data: { executorKey },
      },
      {
        onSuccess: (res: any) => {
          const list = Array.isArray(res) ? res : res?.items ?? [];
          const matched = list.filter(
            (c: ExecutorCandidateDto) =>
              c.executorKey.toLowerCase() === executorKey.toLowerCase()
          );

          if (matched.length > 0) {
            setCandidates(matched);
            // Nếu chưa có path thì tự điền bản đầu tiên tìm thấy
            if (!executablePath) {
              setExecutablePath(matched[0].executablePath);
              if (matched[0].version) setVersion(matched[0].version);
            }
            toast.success(
              `Found ${matched.length} ${meta.name} installation(s) on machine`
            );
          } else {
            toast.info(`No ${meta.name} installations detected automatically.`);
          }
        },
        onError: (err: any) => {
          toast.error(err?.message || `Failed to scan for ${meta.name}`);
        },
      }
    );
  };

  const handleSave = () => {
    if (!executablePath.trim()) {
      toast.error("Executable binary path is required");
      return;
    }

    onSave({
      executorKey,
      executablePath: executablePath.trim(),
      version: version.trim() || null,
      isEnabled,
      settings,
    });
  };

  // Tra cứu Extension tương ứng theo Registry
  const ExtensionComponent = EXECUTOR_EXTENSIONS[executorKey.toLowerCase()];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden transition-all">
      {/* Collapsible Header Summary Row */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/40 transition-colors select-none gap-3"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200 shrink-0",
              !isExpanded && "-rotate-90"
            )}
          />

          <div className="size-6 rounded flex items-center justify-center shrink-0 overflow-hidden">
            {meta.iconUrl ? (
              <img
                src={meta.iconUrl}
                alt={meta.name}
                className="size-5 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <Layers className="size-4 text-muted-foreground" />
            )}
          </div>

          <span className="font-semibold text-sm text-foreground shrink-0">
            {meta.name}
          </span>

          {/* Quick preview when collapsed */}
          {!isExpanded && (
            <div className="flex items-center gap-2 min-w-0 truncate text-xs text-muted-foreground">
              {version && (
                <span className="font-mono text-[11px] font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">
                  v{version}
                </span>
              )}
              {executablePath && (
                <span
                  className="font-mono text-[11px] truncate max-w-[280px]"
                  title={executablePath}
                >
                  {executablePath}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <span className="size-2 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />
          )}

          {isConfigured ? (
            <Badge
              variant="outline"
              className="text-[11px] font-normal text-foreground bg-muted/30 border-border gap-1"
            >
              <Check className="size-3 text-emerald-500" />
              <span>Configured</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[11px] font-normal text-muted-foreground bg-muted/10 border-dashed"
            >
              Not setup
            </Badge>
          )}
        </div>
      </div>

      {/* Expanded Configuration Body */}
      {isExpanded && (
        <div className="p-4 pt-1 space-y-4 border-t border-border/60">
          {/* Executable Path Input + Actions */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-foreground">
                Executable Binary Path
              </label>
              <span className="font-mono text-[11px] text-muted-foreground">
                --{executorKey}-bin
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Input
                value={executablePath}
                onChange={(e) => setExecutablePath(e.target.value)}
                placeholder={`e.g. /usr/bin/${executorKey} or C:\\Program Files\\...`}
                className="h-8 font-mono text-xs flex-1 bg-background"
              />

              {runnerId && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={handleBrowse}
                  isDisabled={isSaving}
                  className="h-8 px-2.5 text-xs cursor-pointer shrink-0 gap-1"
                  aria-label="Browse runner machine for executable"
                >
                  <FolderOpen className="size-3.5" />
                  <span>Browse</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onPress={handleCopyPath}
                isDisabled={!executablePath}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0 gap-1"
                aria-label="Copy path"
              >
                {isCopied ? (
                  <>
                    <Check className="size-3.5 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span className="hidden sm:inline">Copy</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Discovered / Available Installations List & Switcher */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-primary" />
                <span>Discovered Installations ({allCandidates.length})</span>
              </span>

              {runnerId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={handleDetect}
                  isDisabled={scanMutation.isPending || isSaving}
                  className="h-6 px-2 text-[11px] gap-1 text-primary hover:bg-primary/10 cursor-pointer"
                >
                  {scanMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Radar className="size-3" />
                  )}
                  <span>{scanMutation.isPending ? "Scanning..." : "Scan Machine"}</span>
                </Button>
              )}
            </div>

            {allCandidates.length > 0 ? (
              <div className="space-y-1 border border-border/50 rounded-lg p-1.5 bg-muted/20">
                {allCandidates.map((cand, idx) => {
                  const isActive =
                    Boolean(executablePath) &&
                    cand.executablePath.toLowerCase() === executablePath.toLowerCase();

                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectCandidate(cand)}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md transition-all cursor-pointer text-xs select-none",
                        isActive
                          ? "bg-primary/15 border border-primary/40 text-foreground font-medium shadow-2xs"
                          : "hover:bg-muted/60 text-muted-foreground hover:text-foreground border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className={cn(
                            "size-4 rounded-full flex items-center justify-center border shrink-0 transition-colors",
                            isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          )}
                        >
                          {isActive && <div className="size-1.5 rounded-full bg-background" />}
                        </div>

                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono px-1.5 py-0 h-4 shrink-0",
                            isActive
                              ? "border-primary/40 text-primary bg-primary/10 font-semibold"
                              : "text-muted-foreground"
                          )}
                        >
                          {cand.version ? `v${cand.version}` : "detected"}
                        </Badge>

                        <span
                          className="font-mono text-[11px] truncate"
                          title={cand.executablePath}
                        >
                          {cand.executablePath}
                        </span>
                      </div>

                      {isActive ? (
                        <span className="text-[11px] text-emerald-500 font-semibold px-2 flex items-center gap-1 shrink-0">
                          <Check className="size-3" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-primary/80 hover:text-primary font-medium px-2 shrink-0">
                          Select
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground bg-muted/10">
                <span>No installations detected automatically.</span>
                {runnerId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={handleDetect}
                    isDisabled={scanMutation.isPending}
                    className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                  >
                    <Radar className="size-3 text-primary" />
                    <span>Detect Now</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Target Version & Headless Execution Flags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Target Version Identifier
              </label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 5.4.2, 4.2"
                className="h-7 font-mono text-xs bg-background"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Headless Execution Flags (Default)
              </label>
              <Input
                value={settings.headlessFlags || ""}
                onChange={(e) =>
                  setSettings({ ...settings, headlessFlags: e.target.value })
                }
                placeholder={
                  executorKey === "unreal"
                    ? "-nullrhi -unattended -nosplash"
                    : executorKey === "blender"
                    ? "-b -factory-startup"
                    : "-u -B"
                }
                className="h-7 font-mono text-xs bg-background"
              />
            </div>
          </div>

          {/* EXTENSION SLOT: Cắm extension component riêng biệt (ví dụ Unreal Engine project mapping) */}
          {ExtensionComponent && (
            <ExtensionComponent
              runnerId={runnerId}
              runnerName={runnerName}
              settings={settings}
              onUpdateSettings={(newSettings) => setSettings(newSettings)}
              disabled={isSaving}
            />
          )}

          {/* Save Footer Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <div>
              {isDirty ? (
                <span className="text-[11px] font-medium text-amber-500 flex items-center gap-1.5">
                  <AlertCircle className="size-3.5" />
                  <span>Unsaved modifications</span>
                </span>
              ) : isConfigured ? (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-500" />
                  <span>Configuration synced</span>
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Not yet setup on this runner
                </span>
              )}
            </div>

            <Button
              variant={isDirty ? "default" : "outline"}
              size="sm"
              onPress={handleSave}
              isDisabled={isSaving || !executablePath}
              className="h-7 px-3 text-xs gap-1.5 cursor-pointer"
            >
              <Save className="size-3.5" />
              <span>{isSaving ? "Saving..." : "Save Configuration"}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Remote File Browser Modal (Fallback if parent does not handle) */}
      {runnerId && !onOpenBrowse && (
        <RemoteFileBrowserDialog
          open={browseBinaryOpen}
          onOpenChange={setBrowseBinaryOpen}
          runnerId={runnerId}
          runnerName={runnerName}
          title={`Browse ${meta.name} Executable`}
          description={`Select the ${meta.name} binary on runner ${runnerName || runnerId}`}
          mode="file"
          extensions={[".exe", ""]}
          initialPath={executablePath || undefined}
          onSelect={(selectedPath) => setExecutablePath(selectedPath)}
        />
      )}
    </div>
  );
}
