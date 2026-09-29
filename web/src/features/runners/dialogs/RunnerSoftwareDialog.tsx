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
import { BaseExecutorCard } from "../components/BaseExecutorCard";
import { getSoftwareMetadata, SUPPORTED_EXECUTOR_KEYS } from "../constants/dccEngines";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  Sparkles,
  PackageOpen,
  Cpu,
  Search,
  X,
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
    () => new Map<string, RunnerExecutorConfigDto>(
      activeConfigs.map((c) => [c.executorKey?.toLowerCase(), c])
    ),
    [activeConfigs]
  );

  const [executors, setExecutors] = useState<ExecutorCandidateDto[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

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
          toast.success(
            `Saved ${payload.executorKey.toUpperCase()} executor configuration`
          );
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to save executor configuration");
        },
      }
    );
  };

  useEffect(() => {
    if (open && runnerId && executors.length === 0 && !scanMutation.isPending) {
      handleScan();
    }
  }, [open, runnerId]);

  // Luôn đảm bảo các executor hệ thống hỗ trợ xuất hiện trong danh mục
  const groupedExecutors = useMemo(() => {
    const map = new Map<string, ExecutorCandidateDto[]>();

    // 1. Thêm các supported executor keys cốt lõi (python, blender, unreal)
    for (const key of SUPPORTED_EXECUTOR_KEYS) {
      map.set(key, []);
    }

    // 2. Điền candidates phát hiện từ máy
    for (const item of executors) {
      const key = item.executorKey.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    // 3. Đảm bảo những active configs đã cấu hình trước đó vẫn luôn xuất hiện
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

  // Số lượng executor đã được setup path trên máy này
  const configuredCount = useMemo(() => {
    return uniqueKeys.filter((key) => !!activeConfigMap.get(key)?.executablePath).length;
  }, [uniqueKeys, activeConfigMap]);

  // Filter keys by search query
  const filteredKeys = useMemo(() => {
    if (!searchQuery.trim()) return uniqueKeys;
    const q = searchQuery.toLowerCase().trim();
    return uniqueKeys.filter((key) => {
      const meta = getSoftwareMetadata(key);
      return (
        key.toLowerCase().includes(q) ||
        meta.name.toLowerCase().includes(q)
      );
    });
  }, [uniqueKeys, searchQuery]);

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Runner Settings"
      description={`Manage supported pipeline executors and machine configuration for ${runnerName}.`}
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
        </div>
      }
    >
      <div className="space-y-4 py-1 max-h-[620px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25 [&::-webkit-scrollbar-track]:bg-transparent">
        {/* VS Code Settings Search & Runner Banner */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search executor settings (e.g. unreal, python, blender)..."
              className="pl-9 pr-8 h-9 text-xs bg-muted/30 font-mono"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setSearchQuery("")}
                className="absolute right-1 top-1 h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/60 text-xs shrink-0">
            <Cpu className="size-3.5 text-primary shrink-0" />
            <span className="font-semibold text-foreground truncate max-w-[140px]">
              {runnerName}
            </span>
            <Badge variant="outline" className="font-mono text-[10px] h-4 px-1.5">
              {configuredCount}/{uniqueKeys.length} setup
            </Badge>
          </div>
        </div>

        {/* Loading state */}
        {scanMutation.isPending && (
          <div className="flex flex-col items-center justify-center p-12 rounded-xl border border-dashed bg-muted/30 space-y-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary animate-spin">
              <RefreshCw className="size-5" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                Scanning runner workstation filesystem...
              </p>
              <p className="text-xs text-muted-foreground">
                Querying standard install dirs, PATH registry, and Epic Games launcher.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!scanMutation.isPending && filteredKeys.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 rounded-xl border border-dashed bg-card text-center space-y-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <PackageOpen className="size-5" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-foreground">
                No Executors Found
              </p>
              <p className="text-xs text-muted-foreground">
                {searchQuery
                  ? `No executors matched "${searchQuery}". Try clearing search.`
                  : "No executors configured or discovered on this runner."}
              </p>
            </div>
          </div>
        )}

        {/* Render BaseExecutorCard for each key (Collapsible) */}
        {!scanMutation.isPending &&
          filteredKeys.map((key, index) => {
            const candidates = groupedExecutors.get(key) || [];
            const activeConfig = activeConfigMap.get(key);
            const defaultCand = candidates[0];

            return (
              <BaseExecutorCard
                key={key}
                runnerId={runnerId}
                runnerName={runnerName}
                executorKey={key}
                defaultCandidate={defaultCand}
                activeConfig={activeConfig}
                availableCandidates={candidates}
                defaultExpanded={index === 0 || !activeConfig?.executablePath}
                onSave={handleSaveExecutor}
                isSaving={configureMutation.isPending}
              />
            );
          })}
      </div>
    </BaseDialog>
  );
}
