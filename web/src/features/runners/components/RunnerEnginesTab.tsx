import { useState, useEffect, useMemo } from "react";
import {
  useRunners,
  useScanRunnerExecutors,
  useConfigureRunnerExecutor,
  type RunnerExecutorConfigDto,
} from "../hooks/useRunners";
import type { ExecutorCandidateDto } from "../types";
import { SUPPORTED_EXECUTOR_KEYS, getSoftwareMetadata } from "../constants/dccEngines";
import { ExecutorIcon } from "./ExecutorIcon";
import { UnrealExecutorExtension } from "./ExecutorExtensions";
import { RemoteFileBrowserDialog } from "@/components/custom-ui/file-tree";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  RefreshCw,
  FolderOpen,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RunnerEnginesTabProps {
  runnerId: string;
  runnerName?: string;
  isOnline: boolean;
}

export function RunnerEnginesTab({
  runnerId,
  runnerName = "Runner",
  isOnline,
}: RunnerEnginesTabProps) {
  const { data: runners } = useRunners();
  const currentRunner = runners?.find((r) => r.id === runnerId);

  const activeConfigs = (currentRunner?.executorConfigs || []) as RunnerExecutorConfigDto[];
  const activeConfigMap = useMemo(
    () =>
      new Map<string, RunnerExecutorConfigDto>(
        activeConfigs.map((c) => [c.executorKey?.toLowerCase(), c])
      ),
    [activeConfigs]
  );

  const [executors, setExecutors] = useState<ExecutorCandidateDto[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedProjectsKey, setExpandedProjectsKey] = useState<string | null>(null);

  // File browser dialog state
  const [browserState, setBrowserState] = useState<{
    open: boolean;
    executorKey?: string;
    title?: string;
    initialPath?: string;
    onSelected?: (path: string) => void;
  }>({ open: false });

  const scanMutation = useScanRunnerExecutors();
  const configureMutation = useConfigureRunnerExecutor();

  const handleScan = () => {
    if (!runnerId) return;

    scanMutation.mutate(
      {
        runnerId,
        data: {},
      },
      {
        onSuccess: (res: any) => {
          const list = Array.isArray(res) ? res : res?.items ?? [];
          setExecutors(list);
          toast.success(`Discovered ${list.length} DCC software engine(s) on runner.`);
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to scan software on runner");
        },
      }
    );
  };

  useEffect(() => {
    if (runnerId && executors.length === 0 && !scanMutation.isPending && isOnline) {
      handleScan();
    }
  }, [runnerId, isOnline]);

  const handleSaveExecutor = (payload: {
    executorKey: string;
    executablePath: string;
    version: string | null;
    isEnabled: boolean;
    settings: Record<string, any>;
  }) => {
    if (!runnerId) return;

    configureMutation.mutate(
      {
        runnerId,
        data: {
          executorKey: payload.executorKey,
          executablePath: payload.executablePath,
          version: payload.version ?? null,
          isEnabled: payload.isEnabled,
          settings: payload.settings,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Active runtime for ${payload.executorKey} updated.`);
        },
        onError: (err: any) => {
          toast.error(err?.message || `Failed to update ${payload.executorKey} settings`);
        },
      }
    );
  };

  const handleCopyPath = async (key: string, path: string) => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopiedKey(key);
      toast.success("Executable path copied to clipboard");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Failed to copy path");
    }
  };

  // Group candidates by normalized executor key
  const candidatesByExecutor = useMemo(() => {
    const map = new Map<string, ExecutorCandidateDto[]>();
    for (const key of SUPPORTED_EXECUTOR_KEYS) {
      map.set(key, []);
    }
    for (const candidate of executors) {
      const meta = getSoftwareMetadata(candidate.executorKey || "");
      const matchedKey = meta.key.toLowerCase();
      const list = map.get(matchedKey) || [];
      list.push(candidate);
      map.set(matchedKey, list);
    }
    return map;
  }, [executors]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="size-4.5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Software & DCC Runtimes
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure default executables and inspect discovered installations for pipeline step executions.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onPress={handleScan}
          isDisabled={scanMutation.isPending || !isOnline}
          className="gap-2 cursor-pointer text-xs h-8 px-3 shrink-0"
        >
          <RefreshCw className={cn("size-3.5", scanMutation.isPending && "animate-spin")} />
          <span>{scanMutation.isPending ? "Scanning Machine..." : "Re-scan Installed DCCs"}</span>
        </Button>
      </div>

      {/* Main DCC Engine Cards Grid */}
      <div className="grid grid-cols-1 gap-5">
        {SUPPORTED_EXECUTOR_KEYS.map((key) => {
          const meta = getSoftwareMetadata(key);
          const activeCfg = activeConfigMap.get(key);
          const candidates = candidatesByExecutor.get(key) || [];
          const currentPath = activeCfg?.executablePath || "";
          const currentVersion = activeCfg?.version || "";
          const isConfigured = Boolean(currentPath.trim());
          const isUnreal = key === "unreal";

          return (
            <Card
              key={key}
              className="border border-border/80 bg-card hover:border-border transition-all duration-200 overflow-hidden"
            >
              <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Icon + Name + Category */}
                  <div className="flex items-center gap-3.5">
                    <div className="size-11 rounded-xl bg-background border border-border/80 p-2 flex items-center justify-center shadow-2xs shrink-0">
                      <ExecutorIcon executor={key} className="size-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-foreground">
                          {meta.name}
                        </CardTitle>
                        <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
                          {meta.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  {/* Right: Active Status Badge */}
                  <div className="flex items-center gap-2">
                    {isConfigured ? (
                      <Badge
                        variant="outline"
                        className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-xs font-mono h-6 px-2.5"
                      >
                        <CheckCircle2 className="size-3 mr-1.5" />
                        {currentVersion ? `Active: ${currentVersion}` : "Configured"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-xs font-mono h-6 px-2.5"
                      >
                        <AlertCircle className="size-3 mr-1.5" />
                        Not Configured
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-5">
                {/* Active Executable Path Row */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>Executable Path (.exe)</span>
                    </label>
                    {currentPath && (
                      <span className="text-[11px] text-muted-foreground font-mono truncate max-w-sm">
                        {currentVersion ? `Version: ${currentVersion}` : ""}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Input
                        readOnly
                        value={currentPath || "No active executable configured yet"}
                        placeholder="Path to executable on workstation..."
                        className="font-mono text-xs bg-muted/30 pr-10 text-foreground truncate h-9"
                      />
                      {currentPath && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onPress={() => handleCopyPath(key, currentPath)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground hover:text-foreground cursor-pointer"
                          aria-label="Copy path"
                        >
                          {copiedKey === key ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        setBrowserState({
                          open: true,
                          executorKey: key,
                          title: `Select ${meta.name} Executable`,
                          initialPath: currentPath,
                          onSelected: (selectedPath) => {
                            const matchedCand = candidates.find(
                              (c) => c.executablePath.toLowerCase() === selectedPath.toLowerCase()
                            );
                            handleSaveExecutor({
                              executorKey: key,
                              executablePath: selectedPath,
                              version: matchedCand?.version || currentVersion || null,
                              isEnabled: true,
                              settings: (activeCfg?.settings as Record<string, any>) || {},
                            });
                          },
                        })
                      }
                      className="gap-1.5 text-xs h-9 px-3.5 cursor-pointer shrink-0"
                    >
                      <FolderOpen className="size-3.5 text-primary" />
                      <span>Browse Remote...</span>
                    </Button>
                  </div>
                </div>

                {/* Discovered Candidates Section */}
                <div className="space-y-2.5 pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-amber-500" />
                      <span>Discovered Installations on This Workstation</span>
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
                      {candidates.length} Found
                    </Badge>
                  </div>

                  {candidates.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {candidates.map((candidate, idx) => {
                        const isActive =
                          currentPath.toLowerCase() === candidate.executablePath.toLowerCase();

                        return (
                          <div
                            key={idx}
                            className={cn(
                              "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border text-xs transition-colors",
                              isActive
                                ? "bg-primary/5 border-primary/30"
                                : "bg-muted/20 border-border/60 hover:bg-muted/40"
                            )}
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={isActive ? "default" : "secondary"}
                                  className="text-[11px] font-semibold font-mono px-2 py-0"
                                >
                                  {candidate.version || "Custom Build"}
                                </Badge>
                                {isActive && (
                                  <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                                    <Check className="size-3" /> Current Active
                                  </span>
                                )}
                              </div>
                              <p className="font-mono text-[11px] text-muted-foreground truncate select-all">
                                {candidate.executablePath}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onPress={() => handleCopyPath(`${key}-${idx}`, candidate.executablePath)}
                                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                                aria-label="Copy candidate path"
                              >
                                {copiedKey === `${key}-${idx}` ? (
                                  <Check className="size-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </Button>

                              <Button
                                variant={isActive ? "secondary" : "default"}
                                size="sm"
                                isDisabled={isActive || configureMutation.isPending}
                                onPress={() =>
                                  handleSaveExecutor({
                                    executorKey: key,
                                    executablePath: candidate.executablePath,
                                    version: candidate.version || null,
                                    isEnabled: true,
                                    settings: (activeCfg?.settings as Record<string, any>) || {},
                                  })
                                }
                                className={cn(
                                  "h-7 px-3 text-xs font-semibold cursor-pointer transition-all",
                                  isActive
                                    ? "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/10"
                                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                                )}
                              >
                                {isActive ? "Active Version" : "Set as Active"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-border/80 bg-muted/10 text-center space-y-1">
                      <p className="text-xs text-muted-foreground">
                        No discovered versions found yet via scanner.
                      </p>
                      <p className="text-[11px] text-muted-foreground/80">
                        Click "Re-scan Installed DCCs" or use "Browse Remote..." to select the executable file directly.
                      </p>
                    </div>
                  )}
                </div>

                {/* Unreal Engine Specific: Project Mappings */}
                {isUnreal && (
                  <div className="space-y-3 pt-3 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Unreal Project Mappings (.uproject)
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                          {((activeCfg?.settings as any)?.projects?.length) || 0}
                        </Badge>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() =>
                          setExpandedProjectsKey(expandedProjectsKey === "unreal" ? null : "unreal")
                        }
                        className="h-7 px-2 text-xs gap-1 cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        <span>{expandedProjectsKey === "unreal" ? "Hide Projects" : "Manage Projects"}</span>
                        {expandedProjectsKey === "unreal" ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </Button>
                    </div>

                    {expandedProjectsKey === "unreal" && (
                      <div className="p-4 rounded-xl bg-muted/30 border border-border/60">
                        <UnrealExecutorExtension
                          settings={(activeCfg?.settings as any) || {}}
                          runnerId={runnerId}
                          runnerName={runnerName}
                          onUpdateSettings={(newSettings) => {
                            handleSaveExecutor({
                              executorKey: key,
                              executablePath: currentPath,
                              version: currentVersion || null,
                              isEnabled: true,
                              settings: newSettings,
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>


      {/* Remote File Browser Dialog */}
      <RemoteFileBrowserDialog
        open={browserState.open}
        onOpenChange={(open) => setBrowserState((prev) => ({ ...prev, open }))}
        runnerId={runnerId}
        runnerName={runnerName}
        title={browserState.title || "Select Executable File"}
        initialPath={browserState.initialPath}
        onSelect={(path) => {
          if (browserState.onSelected) {
            browserState.onSelected(path);
          }
          setBrowserState({ open: false });
        }}
      />
    </div>
  );
}
