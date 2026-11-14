import type { RunnerDto, RunnerDiskInfo, RunnerGpuInfo } from "../types";
import {
  formatBytes,
  formatCpuModel,
  formatGpuName,
  calculateDiskUsagePercent,
  formatRelativeTime,
} from "../utils/hardwareFormatter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  Zap,
  HardDrive,
  Activity,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RunnerHardwareTabProps {
  runner: RunnerDto;
}

export function RunnerHardwareTab({ runner }: RunnerHardwareTabProps) {
  const hardware = runner.hardwareDetails || {};
  const disks = (hardware.disks || []) as RunnerDiskInfo[];
  const gpus = (hardware.gpus || []) as RunnerGpuInfo[];

  const cpuSummary = formatCpuModel(runner.cpuModel, hardware.logicalCores);
  const primaryGpu = formatGpuName(runner.primaryGpuName);
  const vramText = runner.primaryGpuVramBytes
    ? formatBytes(runner.primaryGpuVramBytes)
    : null;
  const ramText = runner.totalRamBytes ? formatBytes(runner.totalRamBytes) : "Unknown";

  return (
    <div className="space-y-6">
      {/* Hardware Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* GPU Card */}
        <Card className="border border-border/80 bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <Zap className="size-4.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">
                    Graphics Processor (GPU)
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">Compute & Render Device</p>
                </div>
              </div>
              {vramText && (
                <Badge variant="secondary" className="font-mono text-xs px-2 py-0">
                  {vramText} VRAM
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground truncate" title={primaryGpu}>
                {primaryGpu || "Integrated / Generic Adapter"}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                Dedicated VRAM: {vramText || "Shared System Memory"}
              </p>
            </div>

            {gpus.length > 1 && (
              <div className="pt-2 border-t border-border/40 space-y-2">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Additional GPUs ({gpus.length}):
                </span>
                {gpus.map((gpu, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-muted/30 border border-border/40 text-xs flex justify-between">
                    <span className="truncate max-w-[180px] font-medium">{gpu.name}</span>
                    <span className="font-mono text-muted-foreground">{gpu.vramBytes ? formatBytes(gpu.vramBytes) : "N/A"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CPU Card */}
        <Card className="border border-border/80 bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Cpu className="size-4.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">
                    Central Processor (CPU)
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">Pipeline Execution Units</p>
                </div>
              </div>
              {hardware.logicalCores && (
                <Badge variant="secondary" className="font-mono text-xs px-2 py-0">
                  {hardware.logicalCores} Threads
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground truncate" title={cpuSummary}>
                {cpuSummary}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                {hardware.physicalCores && <span>{hardware.physicalCores} Physical Cores</span>}
                {hardware.logicalCores && <span>{hardware.logicalCores} Logical Processors</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RAM Card */}
        <Card className="border border-border/80 bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Activity className="size-4.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">
                    System Memory (RAM)
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">High-Speed Working Set</p>
                </div>
              </div>
              <Badge variant="secondary" className="font-mono text-xs px-2 py-0">
                {ramText}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <p className="text-lg font-bold font-mono text-foreground tracking-tight">
                {ramText}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Total installed system memory available for scene compilation & caching.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Disks & Storage Drives */}
      <Card className="border border-border/80 bg-card shadow-xs">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <HardDrive className="size-4.5" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  Workstation Storage Volumes
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  Local physical partitions, mount points, and remaining capacity
                </p>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5">
              {disks.length} {disks.length === 1 ? "Drive" : "Drives"} Detected
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {disks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disks.map((d, idx) => {
                const usedPct = calculateDiskUsagePercent(d.freeBytes, d.totalBytes);
                const freeStr = formatBytes(d.freeBytes);
                const totalStr = formatBytes(d.totalBytes);
                const isHighUsage = usedPct >= 90;
                const isMediumUsage = usedPct >= 80 && usedPct < 90;

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-muted/20 border border-border/60 space-y-3 hover:border-border transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive className="size-4 text-muted-foreground" />
                        <span className="font-mono font-bold text-xs text-foreground">
                          {d.mount} {d.label ? `[${d.label}]` : ""}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[10px] px-2 py-0",
                          isHighUsage
                            ? "text-destructive border-destructive/30 bg-destructive/10"
                            : isMediumUsage
                            ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                            : "text-muted-foreground"
                        )}
                      >
                        {usedPct}% Used
                      </Badge>
                    </div>

                    <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          isHighUsage
                            ? "bg-destructive"
                            : isMediumUsage
                            ? "bg-amber-500"
                            : "bg-primary"
                        )}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span>{freeStr} Free Available</span>
                      <span>Total: {totalStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No storage partition telemetry reported by runner daemon.
            </div>
          )}
        </CardContent>
      </Card>

      {/* OS & Environment Details */}
      <Card className="border border-border/80 bg-card shadow-xs">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
              <Terminal className="size-4.5" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-foreground">
                Operating System & Platform Environment
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Workstation architecture details</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">OS Platform</span>
              <p className="font-semibold text-foreground truncate">{runner.osPlatform || "Windows"}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Hostname</span>
              <p className="font-mono text-foreground truncate">{runner.name || "Workstation"}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Machine Key</span>
              <p className="font-mono text-foreground truncate select-all">{runner.machineKey}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Last Telemetry Sync</span>
              <p className="text-muted-foreground truncate">{formatRelativeTime(runner.lastHardwareScannedAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
