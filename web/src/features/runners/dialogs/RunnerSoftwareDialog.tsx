import { useState, useEffect } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import {
  useScanRunnerExecutors,
  useConfigureRunnerExecutor,
  useRunners,
  type RunnerExecutorConfigDto,
} from "../hooks/useRunners";
import type { ExecutorCandidateDto } from "../types";
import { getSoftwareMetadata } from "../constants/dccEngines";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Copy,
  Check,
  RefreshCw,
  Layers,
  Sparkles,
  FolderOpen,
  Info,
  PackageOpen,
  Star,
  Zap,
} from "lucide-react";

export interface RunnerSoftwareDialogProps {
  runnerId: string;
  runnerName?: string;
}

export function RunnerSoftwareDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<RunnerSoftwareDialogProps>) {
  const runnerId = data?.runnerId;
  const runnerName = data?.runnerName || "Runner";

  const { data: runners } = useRunners();
  const currentRunner = runners?.find((r) => r.id === runnerId);
  const activeConfigs = (currentRunner?.executorConfigs || []) as RunnerExecutorConfigDto[];
  const activeConfigMap = new Map<string, RunnerExecutorConfigDto>(
    activeConfigs.map((c) => [c.executorKey?.toLowerCase(), c])
  );

  const [executors, setExecutors] = useState<ExecutorCandidateDto[]>([]);
  const [copiedPathIndex, setCopiedPathIndex] = useState<number | null>(null);

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
          toast.success(`Discovered ${list.length} software engine(s) on runner`);
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to scan software on runner");
        },
      }
    );
  };

  const handleSetActive = (item: ExecutorCandidateDto) => {
    if (!runnerId) return;

    configureMutation.mutate(
      {
        runnerId,
        data: {
          executorKey: item.executorKey,
          executablePath: item.executablePath,
          version: item.version,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            `Set ${item.executorKey.toUpperCase()} v${item.version || ""} as active runtime`
          );
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to set active executor runtime");
        },
      }
    );
  };

  useEffect(() => {
    if (open && runnerId && executors.length === 0 && !scanMutation.isPending) {
      handleScan();
    }
  }, [open, runnerId]);

  const copyToClipboard = async (path: string, index: number) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPathIndex(index);
      setTimeout(() => setCopiedPathIndex(null), 2000);
      toast.success("Executable path copied to clipboard");
    } catch {
      toast.error("Failed to copy path");
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Installed Software & Engines"
      description={`Discovered DCC applications, game engines, and runtimes on ${runnerName}.`}
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-4 text-primary" />
            <span>Ready for pipeline stage execution</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={handleScan}
              isDisabled={scanMutation.isPending || !runnerId}
              className="cursor-pointer gap-1.5"
            >
              <RefreshCw
                className={`size-3.5 ${scanMutation.isPending ? "animate-spin" : ""}`}
              />
              <span>{scanMutation.isPending ? "Scanning..." : "Re-scan"}</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onPress={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5 py-1 w-full min-w-0 overflow-hidden">
        {/* Loading state */}
        {scanMutation.isPending && (
          <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed bg-muted/30 space-y-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary animate-spin">
              <RefreshCw className="size-5" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                Querying runner filesystem & registry...
              </p>
              <p className="text-xs text-muted-foreground">
                Scanning standard installation directories, Steam libraries, and Epic Games launcher.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!scanMutation.isPending && executors.length > 0 ? (
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-2 w-full min-w-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25 [&::-webkit-scrollbar-track]:bg-transparent">
            {executors.map((item, index) => {
              const meta = getSoftwareMetadata(item.executorKey);
              const isCopied = copiedPathIndex === index;
              const isVenv = item.executablePath.toLowerCase().includes("venv");

              const activeForThisKey = activeConfigMap.get(item.executorKey?.toLowerCase());
              const isActive =
                !!activeForThisKey &&
                activeForThisKey.executablePath?.toLowerCase() === item.executablePath?.toLowerCase();

              return (
                <div
                  key={`${item.executorKey}-${index}`}
                  className={`w-full min-w-0 overflow-hidden p-3 rounded-xl border transition-all space-y-2.5 ${
                    isActive
                      ? "border-emerald-500/50 bg-emerald-500/[0.03] shadow-xs"
                      : "border-border/70 bg-card hover:border-primary/40 hover:shadow-xs"
                  }`}
                >
                  {/* Top Bar: Icon + Name + Badges + Active Runtime Button */}
                  <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                    {/* Left: Icon & Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-lg bg-muted/80 border border-border/60 flex items-center justify-center shrink-0 p-1.5 overflow-hidden">
                        {meta.iconUrl ? (
                          <img
                            src={meta.iconUrl}
                            alt={meta.name}
                            className="size-full object-contain filter drop-shadow-sm"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <Layers className="size-4 text-primary" />
                        )}
                      </div>

                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm text-foreground truncate">
                          {meta.name}
                        </h4>
                        {isVenv && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1.5 font-mono h-4 shrink-0 bg-muted/60 text-muted-foreground"
                          >
                            Venv
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 px-1.5 font-mono h-4 shrink-0 font-medium"
                        >
                          {meta.category}
                        </Badge>
                      </div>
                    </div>

                    {/* Right: Version & Active Runtime Action */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      {item.version && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[11px] h-5 px-1.5 bg-background border-border text-foreground"
                        >
                          v{item.version}
                        </Badge>
                      )}

                      {isActive ? (
                        <Badge
                          variant="default"
                          className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 text-[10px] h-5 px-2 flex items-center gap-1 font-semibold"
                        >
                          <Star className="size-3 fill-emerald-500 text-emerald-500" />
                          <span>Active Runtime</span>
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={() => handleSetActive(item)}
                          isDisabled={configureMutation.isPending}
                          className="h-5 px-2 text-[10px] font-medium cursor-pointer shrink-0 gap-1 border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Zap className="size-2.5" />
                          <span>Set as Active</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Executable Path Bar (Full Width with Auto Truncate & Copy) */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 border border-border/50 text-xs w-full min-w-0">
                    <div className="flex items-center gap-2 min-w-0 font-mono text-[11px] text-muted-foreground flex-1 overflow-hidden">
                      <FolderOpen className="size-3.5 shrink-0 text-primary" />
                      <span
                        className="block truncate select-all text-foreground min-w-0 flex-1"
                        title={item.executablePath}
                      >
                        {item.executablePath}
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => copyToClipboard(item.executablePath, index)}
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0 gap-1"
                    >
                      {isCopied ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          <span className="text-emerald-500 font-medium text-[11px]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span className="text-[11px]">Copy</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Empty state */}
        {!scanMutation.isPending && executors.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed bg-card text-center space-y-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <PackageOpen className="size-5" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-foreground">
                No Compatible Software Detected
              </p>
              <p className="text-xs text-muted-foreground">
                Make sure Blender, Unreal Engine, or Python is installed on this runner, or trigger a re-scan.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onPress={handleScan}
              className="cursor-pointer gap-1.5 mt-2"
            >
              <RefreshCw className="size-3.5" />
              <span>Scan Again</span>
            </Button>
          </div>
        )}

        {/* Tip / Note footer */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Automation Studio automatically registers these executors to run headless Blender renders, Unreal cooker tasks, or custom Python pipeline scripts on this machine.
          </p>
        </div>
      </div>
    </BaseDialog>
  );
}
