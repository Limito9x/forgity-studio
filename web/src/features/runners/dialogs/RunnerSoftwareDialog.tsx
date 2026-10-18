import { useState, useEffect, useMemo } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import {
  useScanRunnerExecutors,
  useConfigureRunnerExecutor,
  useRunners,
  type RunnerExecutorConfigDto,
} from "../hooks/useRunners";
import type { ExecutorCandidateDto } from "../types";
import { CompactExecutorRow } from "../components/CompactExecutorRow";
import { RemoteFileBrowserDialog } from "@/components/custom-ui/file-tree";
import { getSoftwareMetadata, SUPPORTED_EXECUTOR_KEYS } from "../constants/dccEngines";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

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
  const activeConfigMap = useMemo(
    () =>
      new Map<string, RunnerExecutorConfigDto>(
        activeConfigs.map((c) => [c.executorKey?.toLowerCase(), c])
      ),
    [activeConfigs]
  );

  const [executors, setExecutors] = useState<ExecutorCandidateDto[]>([]);

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
          toast.success(`Discovered ${list.length} software engine(s) on runner`);
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to scan software on runner");
        },
      }
    );
  };

  useEffect(() => {
    if (open && runnerId && executors.length === 0 && !scanMutation.isPending) {
      handleScan();
    }
  }, [open, runnerId]);

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
          version: payload.version,
          isEnabled: payload.isEnabled,
          settings: payload.settings,
        },
      },
      {
        onSuccess: () => {
          const meta = getSoftwareMetadata(payload.executorKey);
          toast.success(
            `Saved ${meta.name} path successfully`,
            {
              description: payload.version ? `Active version: ${payload.version}` : undefined,
            }
          );
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to save executor configuration");
        },
      }
    );
  };

  // Group candidates by supported executor key
  const groupedExecutors = useMemo(() => {
    const map = new Map<string, ExecutorCandidateDto[]>();

    // 1. Core supported keys in order: blender, unreal, python
    for (const key of ["blender", "unreal", "python"]) {
      map.set(key, []);
    }

    // 2. Populate discovered candidates
    for (const item of executors) {
      const key = item.executorKey.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    // 3. Populate existing active configs if not in candidate list
    for (const active of activeConfigs) {
      const key = active.executorKey.toLowerCase();
      if (!map.has(key)) {
        map.set(key, [
          {
            executorKey: active.executorKey ?? "",
            executablePath: active.executablePath ?? "",
            version: active.version ?? "",
          },
        ]);
      }
    }

    return map;
  }, [executors, activeConfigs]);

  const uniqueKeys = Array.from(groupedExecutors.keys());

  // Count configured executors
  const configuredCount = useMemo(() => {
    return uniqueKeys.filter((key) => !!activeConfigMap.get(key)?.executablePath).length;
  }, [uniqueKeys, activeConfigMap]);

  const isAllReady = configuredCount === uniqueKeys.length;

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Runner Software Settings"
      description={`Manage installed 3D DCC engines and pipeline runtimes for ${runnerName}.`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
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
            <span>{scanMutation.isPending ? "Scanning..." : "Re-scan Machine"}</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onPress={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-1">
        {/* Machine Status Bar */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/60 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Cpu className="size-4 text-primary shrink-0" />
            <span className="font-semibold text-foreground truncate">
              {runnerName}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isAllReady ? (
              <Badge
                variant="outline"
                className="h-5 px-2 gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              >
                <CheckCircle2 className="size-3" />
                <span>{configuredCount}/{uniqueKeys.length} Engines Ready</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-5 px-2 gap-1 text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
              >
                <AlertCircle className="size-3" />
                <span>{configuredCount}/{uniqueKeys.length} Configured</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Loading Skeleton during filesystem scan */}
        {scanMutation.isPending && (
          <div className="flex items-center justify-center p-6 rounded-xl border border-dashed bg-muted/20 gap-3">
            <RefreshCw className="size-4 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground">
              Scanning workstation for Blender, Unreal Engine, and Python installations...
            </span>
          </div>
        )}

        {/* Compact Executor Rows */}
        <div className="space-y-2.5">
          {uniqueKeys.map((key) => {
            const candidates = groupedExecutors.get(key) || [];
            const activeConfig = activeConfigMap.get(key);

            return (
              <CompactExecutorRow
                key={key}
                executorKey={key}
                runnerId={runnerId}
                runnerName={runnerName}
                availableCandidates={candidates}
                activeConfig={activeConfig}
                onOpenBrowse={(initialPath, onSelect) => {
                  const meta = getSoftwareMetadata(key);
                  setBrowserState({
                    open: true,
                    executorKey: key,
                    title: `Browse ${meta.name} Executable`,
                    initialPath,
                    onSelected: onSelect,
                  });
                }}
                onSave={handleSaveExecutor}
                isSaving={configureMutation.isPending}
              />
            );
          })}
        </div>
      </div>

      {/* Remote File Browser Modal */}
      {runnerId && (
        <RemoteFileBrowserDialog
          open={browserState.open}
          onOpenChange={(isOpen) =>
            setBrowserState((prev) => ({ ...prev, open: isOpen }))
          }
          runnerId={runnerId}
          runnerName={runnerName}
          title={browserState.title || "Browse Executable"}
          description="Select an executable binary on the runner machine."
          mode="file"
          extensions={[".exe", ""]}
          initialPath={browserState.initialPath}
          onSelect={(selectedPath) => {
            browserState.onSelected?.(selectedPath);
            setBrowserState((prev) => ({ ...prev, open: false }));
          }}
        />
      )}
    </BaseDialog>
  );
}
