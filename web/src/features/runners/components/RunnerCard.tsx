import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Cpu,
  HardDrive,
  RefreshCw,
  Server,
  Zap,
  Clock,
  Layers,
  XCircle,
} from "lucide-react";
import type { RunnerDto } from "../types";
import {
  formatBytes,
  formatCpuModel,
  formatGpuName,
  calculateDiskUsagePercent,
  formatRelativeTime,
} from "../utils/hardwareFormatter";

interface RunnerCardProps {
  runner: RunnerDto;
  onRescanHardware?: (runnerId: string) => void;
  isRescanning?: boolean;
  onScanSoftware?: (runnerId: string) => void;
  isScanningSoftware?: boolean;
}

export function RunnerCard({
  runner,
  onRescanHardware,
  isRescanning = false,
  onScanSoftware,
  isScanningSoftware = false,
}: RunnerCardProps) {
  const isOnline = runner.isOnline ?? true;

  const cpuSummary = formatCpuModel(
    runner.cpuModel,
    runner.hardwareDetails?.logicalCores
  );

  const primaryGpu = formatGpuName(runner.primaryGpuName);
  const vramText = runner.primaryGpuVramBytes
    ? formatBytes(runner.primaryGpuVramBytes)
    : null;

  const ramText = runner.totalRamBytes ? formatBytes(runner.totalRamBytes) : null;

  const disks = runner.hardwareDetails?.disks ?? [];

  return (
    <Card className="flex flex-col justify-between border border-border/80 bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200">
      <div>
        {/* Header */}
        <CardHeader className="pb-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Server className="size-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold truncate tracking-tight text-foreground" title={runner.name || runner.machineKey}>
                  {runner.name || runner.machineKey}
                </CardTitle>
                <CardDescription className="text-xs truncate font-mono text-muted-foreground mt-0.5">
                  {runner.osPlatform || "Windows 11 AMD64"} • {runner.machineKey.slice(0, 16)}
                </CardDescription>
              </div>
            </div>

            {/* Online Status Badge */}
            <Badge
              variant={isOnline ? "default" : "secondary"}
              className={`shrink-0 text-[11px] font-medium py-0.5 px-2 ${
                isOnline
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {isOnline ? (
                <>
                  <span className="relative flex h-2 w-2 mr-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Online</span>
                </>
              ) : (
                <>
                  <XCircle className="size-3 mr-1" />
                  <span>Offline</span>
                </>
              )}
            </Badge>
          </div>
        </CardHeader>

        {/* Content / Specs */}
        <CardContent className="space-y-4 text-xs pt-0">
          {/* Main HW Badges Grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* CPU */}
            <div
              className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 border border-border/50"
              title={runner.cpuModel || "CPU details"}
            >
              <Cpu className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                  Processor
                </div>
                <div className="font-medium text-foreground truncate">
                  {cpuSummary}
                </div>
              </div>
            </div>

            {/* RAM */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
              <Layers className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                  System Memory
                </div>
                <div className="font-medium text-foreground truncate">
                  {ramText ? `${ramText} RAM` : "N/A"}
                </div>
              </div>
            </div>

            {/* GPU */}
            <div
              className="col-span-2 flex items-start gap-2 p-2 rounded-lg bg-muted/50 border border-border/50"
              title={runner.primaryGpuName || "GPU details"}
            >
              <Zap className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Primary Graphics (VRAM)
                  </span>
                  {vramText && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">
                      {vramText} VRAM
                    </Badge>
                  )}
                </div>
                <div className="font-medium text-foreground truncate mt-0.5">
                  {primaryGpu}
                </div>
              </div>
            </div>
          </div>

          {/* Storage Drives with Mini Progress Bar */}
          {disks.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium flex items-center gap-1.5">
                  <HardDrive className="size-3.5 text-muted-foreground" />
                  <span>Storage Drives</span>
                </span>
                <span>{disks.length} {disks.length === 1 ? "drive" : "drives"}</span>
              </div>

              <div className="space-y-1.5">
                {disks.map((d, idx) => {
                  const usedPct = calculateDiskUsagePercent(d.freeBytes, d.totalBytes);
                  const freeStr = formatBytes(d.freeBytes);
                  const totalStr = formatBytes(d.totalBytes);
                  const isHighUsage = usedPct >= 90;

                  return (
                    <div key={idx} className="p-2 rounded-md bg-muted/30 border border-border/40 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-semibold text-foreground">
                          {d.mount} {d.label ? `[${d.label}]` : ""}
                        </span>
                        <span className="text-muted-foreground font-mono">
                          {freeStr} free / {totalStr}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isHighUsage ? "bg-destructive" : "bg-primary"
                          }`}
                          style={{ width: `${usedPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </div>

      {/* Footer / Actions */}
      <CardFooter className="pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 text-[11px]" title={runner.lastHardwareScannedAt || ""}>
          <Clock className="size-3.5 text-muted-foreground" />
          <span>Scanned {formatRelativeTime(runner.lastHardwareScannedAt)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {onScanSoftware && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => onScanSoftware(runner.id)}
              isDisabled={isScanningSoftware}
              className="h-7 px-2 text-[11px] gap-1 cursor-pointer hover:text-foreground"
            >
              <Layers className={`size-3.5 ${isScanningSoftware ? "animate-spin" : ""}`} />
              <span>Software</span>
            </Button>
          )}

          {onRescanHardware && (
            <Button
              variant="outline"
              size="sm"
              onPress={() => onRescanHardware(runner.id)}
              isDisabled={isRescanning}
              className="h-7 px-2 text-[11px] gap-1 cursor-pointer hover:text-foreground"
            >
              <RefreshCw className={`size-3.5 ${isRescanning ? "animate-spin" : ""}`} />
              <span>Re-scan</span>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
