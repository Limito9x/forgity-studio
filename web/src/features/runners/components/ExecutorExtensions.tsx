import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { RemoteFileBrowserDialog } from "@/components/custom-ui/file-tree";
import { useRunnerDccSessions, useStopRunnerDccSession } from "@/features/runners/hooks/useRunnerDccSessions";
import { FolderKanban, FolderOpen, Trash2, Zap, Power } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ExecutorExtensionProps {
  runnerId?: string;
  runnerName?: string;
  settings: Record<string, any>;
  onUpdateSettings: (newSettings: Record<string, any>) => void;
  disabled?: boolean;
}

export function UnrealExecutorExtension({
  runnerId,
  runnerName,
  settings,
  onUpdateSettings,
  disabled = false,
}: ExecutorExtensionProps) {
  const registeredProjects: Record<string, string> = settings.registeredProjects || {};
  const projectKeepAliveMinutes: Record<string, number> = settings.projectKeepAliveMinutes || {};

  const [activeBrowseProjectId, setActiveBrowseProjectId] = useState<string | null>(null);

  const { studioId: activeStudioId } = useCurrentStudio();
  const { data: projectsData, isLoading: isLoadingProjects } = useProjects({
    page: 1,
    pageSize: 100,
    studioId: activeStudioId || undefined,
  } as any);
  const projectList = projectsData?.items || [];

  // Poll resident warm DCC sessions from runner
  const { data: dccSessions = [] } = useRunnerDccSessions(runnerId);
  const { stopSession, isPending: isStoppingSession } = useStopRunnerDccSession(runnerId);

  // Helper matching warm session by uproject path
  const findWarmSession = (rawPath?: string) => {
    if (!rawPath) return undefined;
    const norm = rawPath.trim().toLowerCase().replace(/\\/g, "/");
    return dccSessions.find((s) => {
      if (!s.projectPath) return false;
      return s.projectPath.trim().toLowerCase().replace(/\\/g, "/") === norm;
    });
  };

  // Update a single project's .uproject path immediately in settings
  const handleUpdateProjectPath = (projectId: string, path: string) => {
    const trimmed = path.trim();
    const updated = { ...registeredProjects };

    if (trimmed) {
      updated[projectId] = trimmed;
    } else {
      delete updated[projectId];
    }

    onUpdateSettings({
      ...settings,
      registeredProjects: updated,
    });
  };

  // Update keep-alive duration for a project
  const handleUpdateProjectKeepAlive = (projectId: string, minutes: number) => {
    const updated = { ...projectKeepAliveMinutes };
    if (minutes > 0) {
      updated[projectId] = minutes;
    } else {
      delete updated[projectId];
    }

    onUpdateSettings({
      ...settings,
      projectKeepAliveMinutes: updated,
    });
  };

  const handleRemoveProject = (projectId: string) => {
    const updatedProjects = { ...registeredProjects };
    delete updatedProjects[projectId];

    const updatedKeepAlive = { ...projectKeepAliveMinutes };
    delete updatedKeepAlive[projectId];

    onUpdateSettings({
      ...settings,
      registeredProjects: updatedProjects,
      projectKeepAliveMinutes: updatedKeepAlive,
    });
  };

  const handleSelectRemoteUproject = (selectedPath: string) => {
    if (!activeBrowseProjectId) return;
    handleUpdateProjectPath(activeBrowseProjectId, selectedPath);
    setActiveBrowseProjectId(null);
    toast.success("Linked .uproject path to Studio project");
  };

  // Các registeredProjects có ID không nằm trong Studio projectList hiện tại
  const extraProjectIds = Object.keys(registeredProjects).filter(
    (id) => !projectList.some((p) => p.id === id)
  );

  const configuredCount = Object.keys(registeredProjects).filter(
    (id) => !!registeredProjects[id]
  ).length;

  return (
    <div className="space-y-3 pt-3 border-t border-border/70">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FolderKanban className="size-4 text-amber-500" />
          <span>Registered Unreal Projects (.uproject)</span>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {configuredCount} linked
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Map Studio projects to their local <code className="text-foreground font-semibold">.uproject</code> path on this machine for headless execution. Configure Stay Alive to keep Unreal resident and eliminate engine cold start delays.
      </p>

      {/* Studio Projects List */}
      <div className="space-y-2.5">
        {isLoadingProjects ? (
          <div className="text-center py-3 text-xs text-muted-foreground">
            Loading Studio projects...
          </div>
        ) : projectList.length > 0 ? (
          <div className="space-y-2.5">
            {projectList.map((project) => {
              const currentPath = registeredProjects[project.id] || "";
              const isConfigured = !!currentPath;
              const currentKeepAlive = projectKeepAliveMinutes[project.id] ?? 0;
              const warmSession = findWarmSession(currentPath);

              return (
                <div
                  key={project.id}
                  className="p-2.5 rounded-lg border border-border/70 bg-background/60 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {project.name}
                    </span>
                    {isConfigured ? (
                      <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        Linked
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Not configured
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Input
                      value={currentPath}
                      onChange={(e) => handleUpdateProjectPath(project.id, e.target.value)}
                      placeholder={`Path to ${project.name}.uproject on runner...`}
                      disabled={disabled}
                      className="h-7 text-xs font-mono flex-1 bg-background"
                    />

                    {runnerId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => setActiveBrowseProjectId(project.id)}
                        isDisabled={disabled}
                        className="h-7 px-2 text-xs cursor-pointer gap-1 shrink-0"
                        aria-label={`Browse .uproject for ${project.name}`}
                      >
                        <FolderOpen className="size-3" />
                        <span className="hidden sm:inline">Browse</span>
                      </Button>
                    )}

                    {isConfigured && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => handleRemoveProject(project.id)}
                        isDisabled={disabled}
                        className="size-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                        aria-label={`Remove mapping for ${project.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Stay Alive Duration & Resident Warm Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30 text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Zap className="size-3 text-amber-500 shrink-0" />
                      <span>Stay Alive:</span>
                      <select
                        aria-label={`Stay alive duration for ${project.name}`}
                        value={currentKeepAlive}
                        onChange={(e) => handleUpdateProjectKeepAlive(project.id, Number(e.target.value))}
                        disabled={disabled || !isConfigured}
                        className="bg-muted/40 hover:bg-muted/80 border border-border/60 rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value={0} className="bg-popover text-popover-foreground">Off (Cold start)</option>
                        <option value={15} className="bg-popover text-popover-foreground">15 minutes</option>
                        <option value={30} className="bg-popover text-popover-foreground">30 minutes (Default)</option>
                        <option value={60} className="bg-popover text-popover-foreground">60 minutes</option>
                        <option value={120} className="bg-popover text-popover-foreground">120 minutes</option>
                      </select>
                    </div>

                    {warmSession && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1",
                            warmSession.state === "busy"
                              ? "text-amber-500 bg-amber-500/10"
                              : "text-emerald-500 bg-emerald-500/10"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              warmSession.state === "busy"
                                ? "bg-amber-500 animate-pulse"
                                : "bg-emerald-500"
                            )}
                          />
                          {warmSession.state === "busy"
                            ? `Warm • Busy • PID ${warmSession.pid}`
                            : `Warm • PID ${warmSession.pid} • ${Math.max(0, Math.floor(warmSession.remainingSeconds / 60))}m left`}
                        </span>

                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={async () => {
                            try {
                              await stopSession({ key: warmSession.key });
                              toast.success(`Stopped resident Unreal process (PID ${warmSession.pid})`);
                            } catch (err: any) {
                              toast.error(err?.message || "Failed to stop resident process");
                            }
                          }}
                          isDisabled={disabled || isStoppingSession}
                          className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10 cursor-pointer gap-1"
                          aria-label="Stop resident Unreal process"
                        >
                          <Power className="size-3" />
                          <span>Stop</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-3 px-3 rounded-lg border border-dashed bg-muted/20 text-xs text-muted-foreground">
            No projects found in this Studio. Create a project in the Studio first.
          </div>
        )}

        {/* Extra Mappings not in active Studio */}
        {extraProjectIds.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border/40">
            <span className="text-[11px] font-medium text-muted-foreground">
              Other Linked Projects (External / Legacy):
            </span>
            {extraProjectIds.map((projId) => {
              const currentPath = registeredProjects[projId] || "";
              const warmSession = findWarmSession(currentPath);

              return (
                <div
                  key={projId}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background/40 border border-border/50 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                      ID: {projId}
                    </div>
                    <div className="font-mono text-xs text-foreground truncate">
                      {currentPath}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {warmSession && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={async () => {
                          try {
                            await stopSession({ key: warmSession.key });
                            toast.success(`Stopped resident Unreal process (PID ${warmSession.pid})`);
                          } catch (err: any) {
                            toast.error(err?.message || "Failed to stop resident process");
                          }
                        }}
                        isDisabled={disabled || isStoppingSession}
                        className="h-6 px-1.5 text-[10px] text-destructive hover:bg-destructive/10 cursor-pointer gap-1"
                        aria-label="Stop resident Unreal process"
                      >
                        <Power className="size-3" />
                        <span>Stop (PID {warmSession.pid})</span>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => handleRemoveProject(projId)}
                      isDisabled={disabled}
                      className="size-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                      aria-label="Remove mapping"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Remote File Browser Dialog */}
      {runnerId && activeBrowseProjectId && (
        <RemoteFileBrowserDialog
          open={!!activeBrowseProjectId}
          onOpenChange={(isOpen) => {
            if (!isOpen) setActiveBrowseProjectId(null);
          }}
          runnerId={runnerId}
          runnerName={runnerName}
          title="Browse Remote Unreal Project (.uproject)"
          description={`Select the .uproject file for this project on runner (${runnerName || runnerId})`}
          mode="file"
          extensions={[".uproject"]}
          initialPath={registeredProjects[activeBrowseProjectId] || undefined}
          onSelect={handleSelectRemoteUproject}
        />
      )}
    </div>
  );
}

/**
 * Registry Pattern for Executor Extensions
 */
export const EXECUTOR_EXTENSIONS: Record<
  string,
  React.ComponentType<ExecutorExtensionProps>
> = {
  unreal: UnrealExecutorExtension,
};
