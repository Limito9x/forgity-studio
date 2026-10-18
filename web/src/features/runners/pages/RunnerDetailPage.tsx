import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import {
  useRunners,
  useScanRunnerHardware,
  useScanRunnerExecutors,
  type RunnerDto,
} from "../hooks/useRunners";
import { useAttachedRepositoriesByRunner } from "../hooks/useAttachedRepositoriesByRunner";
import { useProjectNav } from "@/lib/navigation/useProjectNav";
import { RunnerEnginesTab } from "../components/RunnerEnginesTab";
import { RunnerAttachedRepositoriesTab } from "../components/RunnerAttachedRepositoriesTab";
import { RunnerHardwareTab } from "../components/RunnerHardwareTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Server,
  RefreshCw,
  Layers,
  FolderGit2,
  Cpu,
  Loader2,
  Copy,
  Check,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type RunnerDetailTab = "engines" | "repositories" | "hardware";

interface RunnerDetailPageProps {
  runnerId?: string;
}

export function RunnerDetailPage(props: RunnerDetailPageProps = {}) {
  const routeParams = useParams({ strict: false }) as { runnerId?: string };
  const runnerId = props.runnerId || routeParams.runnerId || "";

  const nav = useProjectNav();
  const [activeTab, setActiveTab] = useState<RunnerDetailTab>("engines");
  const [copiedKey, setCopiedKey] = useState(false);

  const { data: runners = [], isLoading: isRunnersLoading, refetch: refetchRunners } = useRunners();
  const runner: RunnerDto | undefined = runners.find((r) => r.id === runnerId);

  const {
    data: attachedRepos = [],
    refetch: refetchRepos,
  } = useAttachedRepositoriesByRunner(runnerId);

  const scanHardwareMutation = useScanRunnerHardware();
  const scanSoftwareMutation = useScanRunnerExecutors();

  const isRescanning = scanHardwareMutation.isPending || scanSoftwareMutation.isPending;

  const handleRefreshAll = () => {
    refetchRunners();
    refetchRepos();
    toast.success("Workstation data refreshed");
  };

  const handleRescanMachine = () => {
    if (!runnerId) return;

    scanHardwareMutation.mutate(
      { runnerId },
      {
        onSuccess: () => {
          toast.success("Hardware telemetry refreshed.");
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to trigger hardware rescan");
        },
      }
    );

    scanSoftwareMutation.mutate(
      { runnerId, data: {} },
      {
        onSuccess: () => {
          toast.success("DCC software scanner triggered.");
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to trigger software scan");
        },
      }
    );
  };

  const handleCopyMachineKey = async () => {
    if (!runner?.machineKey) return;
    try {
      await navigator.clipboard.writeText(runner.machineKey);
      setCopiedKey(true);
      toast.success("Machine key copied to clipboard");
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      toast.error("Failed to copy machine key");
    }
  };

  if (isRunnersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3 text-muted-foreground text-sm">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span>Loading runner workstation details...</span>
      </div>
    );
  }

  if (!runner) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground text-sm">Runner workstation not found.</p>
        <Button
          variant="outline"
          size="sm"
          onPress={() => nav.toRunners()}
          className="gap-2 cursor-pointer text-xs"
        >
          <ArrowLeft className="size-4" /> Back to Runners
        </Button>
      </div>
    );
  }

  const isOnline = runner.isOnline ?? true;
  const configuredExecutorsCount = (
    (runner.executorConfigs as Array<{ executablePath?: string }> | null | undefined) || []
  ).filter((c) => Boolean(c.executablePath?.trim())).length;

  const tabs: Array<{
    key: RunnerDetailTab;
    label: string;
    icon: React.ElementType;
    badge?: React.ReactNode;
  }> = [
      {
        key: "engines",
        label: "Software & DCC Engines",
        icon: Layers,
        badge: (
          <Badge
            variant="secondary"
            className="text-[10px] font-mono px-1.5 py-0 h-4 min-w-4 flex items-center justify-center"
          >
            {configuredExecutorsCount}
          </Badge>
        ),
      },
      {
        key: "repositories",
        label: "Attached Repositories",
        icon: FolderGit2,
        badge: (
          <Badge
            variant="secondary"
            className="text-[10px] font-mono px-1.5 py-0 h-4 min-w-4 flex items-center justify-center"
          >
            {attachedRepos.length}
          </Badge>
        ),
      },
      {
        key: "hardware",
        label: "Hardware Specs",
        icon: Cpu,
      },
    ];

  return (
    <div className="p-6 space-y-6 w-full min-w-0">
      {/* Top Header: Clean & Studio Grade (Matching RepositoryDetailPage) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl cursor-pointer shrink-0"
            onPress={() => nav.toRunners()}
            aria-label="Back to runners"
          >
            <ArrowLeft className="size-4" />
          </Button>

          <div className="min-w-0">
            {/* Row 1: Icon + Name + Online Status */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5 truncate">
                <Server className="size-6 text-primary shrink-0" />
                <span className="truncate">{runner.name || runner.machineKey}</span>
              </h1>

              <Badge
                variant="outline"
                className={
                  isOnline
                    ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-xs font-mono"
                    : "text-muted-foreground border-border text-xs font-mono"
                }
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full mr-1.5",
                    isOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                  )}
                />
                {isOnline ? "Online & Ready" : "Offline"}
              </Badge>

              {runner.appVersion && (
                <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
                  v{runner.appVersion}
                </Badge>
              )}
            </div>

            {/* Row 2: Metadata (Machine key with copy button + OS) */}
            <div className="flex items-center gap-2.5 flex-wrap mt-1">
              <button
                onClick={handleCopyMachineKey}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/40 hover:bg-muted/70 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Click to copy machine key"
              >
                <Terminal className="size-3" />
                <span className="truncate max-w-[200px]">{runner.machineKey}</span>
                {copiedKey ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>

              <span className="text-muted-foreground text-xs">•</span>

              <span className="text-xs text-muted-foreground">
                OS: <span className="font-medium text-foreground">{runner.osPlatform || "Windows"}</span>
              </span>

              {runner.primaryGpuName && (
                <>
                  <span className="text-muted-foreground text-xs">•</span>
                  <span className="text-xs text-muted-foreground truncate max-w-xs">
                    GPU: <span className="font-medium text-foreground">{runner.primaryGpuName}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onPress={handleRescanMachine}
            isDisabled={isRescanning || !isOnline}
            className="gap-1.5 cursor-pointer text-xs h-8 px-3"
            aria-label="Re-scan hardware and software"
          >
            <RefreshCw className={cn("size-3.5", isRescanning && "animate-spin")} />
            <span>{isRescanning ? "Scanning..." : "Re-scan Machine"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onPress={handleRefreshAll}
            className="gap-1.5 cursor-pointer text-xs h-8 px-3"
            aria-label="Refresh page data"
          >
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Segmented Pill Tabs Navigation (Matching RepositoryDetailPage exactly) */}
      <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/60 gap-1 w-fit">
        {tabs.map(({ key, label, icon: Icon, badge }) => {
          const isActive = activeTab === key;
          return (
            <Button
              key={key}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              onPress={() => setActiveTab(key)}
              className={cn(
                "group h-8 flex items-center gap-2 px-3 text-xs font-medium rounded-lg transition-all select-none cursor-pointer",
                isActive
                  ? "bg-background text-foreground font-semibold shadow-xs border border-border/50 hover:bg-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Icon className={cn("size-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
              <span>{label}</span>
              {badge}
            </Button>
          );
        })}
      </div>

      {/* Tab 1: Software & DCC Engines */}
      {activeTab === "engines" && (
        <RunnerEnginesTab
          runnerId={runner.id}
          runnerName={runner.name || runner.machineKey}
          isOnline={isOnline}
        />
      )}

      {/* Tab 2: Attached Repositories */}
      {activeTab === "repositories" && (
        <RunnerAttachedRepositoriesTab
          runnerId={runner.id}
          runnerName={runner.name || runner.machineKey}
          isOnline={isOnline}
        />
      )}

      {/* Tab 3: Hardware Specs */}
      {activeTab === "hardware" && <RunnerHardwareTab runner={runner} />}
    </div>
  );
}
