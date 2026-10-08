import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cpu, HardDrive, Plus, Clock, Edit2, RefreshCw } from "lucide-react";
import type { RepositoryRunnerDto } from "../hooks/useRepositories";

interface AttachedRunnersCardProps {
  repositoryId: string;
  repositoryName: string;
  runners: RepositoryRunnerDto[];
  onAttachRunner: (initialData?: { runnerId?: string; rootPath?: string }) => void;
  onScanSyncRunner?: (runnerId: string) => void;
}

export function AttachedRunnersCard({
  repositoryName: _repositoryName,
  runners,
  onAttachRunner,
  onScanSyncRunner,
}: AttachedRunnersCardProps) {
  return (
    <Card className="rounded-2xl border-border/60 bg-card">
      <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            <CardTitle className="text-base font-semibold">Attached Compute Runners</CardTitle>
            <Badge variant="secondary" className="text-xs font-mono ml-1">
              {runners.length}
            </Badge>
          </div>
          <CardDescription className="text-xs mt-0.5">
            Physical machine workers mounting this repository for asset synchronization and job execution
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAttachRunner()}
          className="gap-1.5 cursor-pointer text-xs"
        >
          <Plus className="size-3.5" /> Attach Runner
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {runners.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Cpu className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No compute runners attached yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Attach a local runner to scan files, synchronize assets, and execute pipeline tasks (Blender, Daz, Unreal).
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => onAttachRunner()}
              className="gap-1.5 cursor-pointer text-xs"
            >
              <Plus className="size-3.5" /> Attach First Runner
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {runners.map((item) => {
              const isOnline = item.runner?.isActive;
              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3.5 hover:bg-muted/30 transition-colors text-xs gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5 sm:mt-0">
                      <Cpu className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">
                          {item.runner?.name || item.runner?.machineKey || "Runner Node"}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ({item.runner?.machineKey || item.runnerId})
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            isOnline
                              ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px]"
                              : "text-muted-foreground border-border text-[10px]"
                          }
                        >
                          <span
                            className={`size-1.5 rounded-full mr-1 ${
                              isOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                            }`}
                          />
                          {isOnline ? "Online" : "Offline"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                        <Clock className="size-3" />
                        <span className="text-[11px]">
                          {item.lastSyncAt
                            ? `Last sync: ${new Date(item.lastSyncAt).toLocaleString()}`
                            : "Never synced"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
                    <div
                      className="flex items-center gap-1.5 font-mono text-[11px] bg-muted/40 px-2.5 py-1 rounded-md border border-border/50 max-w-xs sm:max-w-md truncate"
                      title={item.rootPath}
                    >
                      <HardDrive className="size-3 text-primary/70 shrink-0" />
                      <span className="truncate">{item.rootPath}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onScanSyncRunner && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onScanSyncRunner(item.runnerId)}
                          isDisabled={!isOnline}
                          className="gap-1 cursor-pointer text-xs h-7 px-2.5 text-primary hover:text-primary hover:bg-primary/10 border-primary/20 shrink-0"
                          aria-label={isOnline ? "Scan local folder for file changes" : "Runner is offline"}
                        >
                          <RefreshCw className="size-3" /> Scan & Sync
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onAttachRunner({
                            runnerId: item.runnerId,
                            rootPath: item.rootPath,
                          })
                        }
                        className="gap-1 cursor-pointer text-xs h-7 px-2 text-muted-foreground hover:text-foreground shrink-0"
                        aria-label="Edit mount path"
                      >
                        <Edit2 className="size-3" /> Edit Path
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
