import { useState } from "react";
import { useRunners, useScanRunnerHardware } from "./hooks/useRunners";
import { Button } from "@/components/ui/button";
import { Cpu, RefreshCw, Loader2, Plus } from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";
import { RunnerCard } from "./components/RunnerCard";
import { toast } from "sonner";

export function RunnerPage() {
  const { data: runners = [], isLoading, isError, error, refetch } = useRunners();
  const openDialog = useDialogStore((state) => state.openDialog);

  const scanHardwareMutation = useScanRunnerHardware();
  const [scanningHardwareRunnerId, setScanningHardwareRunnerId] = useState<string | null>(null);

  const handleRescanHardware = (runnerId: string) => {
    setScanningHardwareRunnerId(runnerId);
    scanHardwareMutation.mutate(
      { runnerId },
      {
        onSuccess: () => {
          toast.success("Hardware profile refreshed successfully");
          setScanningHardwareRunnerId(null);
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to trigger hardware rescan on runner");
          setScanningHardwareRunnerId(null);
        },
      }
    );
  };

  const handleOpenSoftware = (runner: any) => {
    openDialog("runner-software", {
      runnerId: runner.id,
      runnerName: runner.name || runner.machineKey,
    });
  };

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <Cpu className="size-6 text-primary shrink-0" />
            <h1 className="text-2xl font-bold tracking-tight">Runner Management</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage physical compute nodes, render machines, and pipeline execution workers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onPress={() => refetch()} className="cursor-pointer gap-1.5">
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onPress={() => openDialog("connect-runner")}
            className="cursor-pointer gap-1.5"
          >
            <Plus className="size-3.5" />
            <span>Connect Runner</span>
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span>Loading runners...</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          Failed to load runners: {(error as any)?.message || "Unknown error"}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && runners.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-lg bg-card space-y-4">
          <div className="p-4 bg-primary/10 rounded-full text-primary">
            <Cpu className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">No Runners Connected</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Link your PC, graphic workstation, or render node using a quick setup token.
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            onPress={() => openDialog("connect-runner")}
            className="cursor-pointer gap-1.5 mt-2"
          >
            <Plus className="size-3.5" />
            <span>Connect Your First Runner</span>
          </Button>
        </div>
      )}

      {/* Runners Grid */}
      {!isLoading && !isError && runners.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {runners.map((runner) => (
            <RunnerCard
              key={runner.id}
              runner={runner}
              onRescanHardware={handleRescanHardware}
              isRescanning={scanningHardwareRunnerId === runner.id}
              onScanSoftware={() => handleOpenSoftware(runner)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
