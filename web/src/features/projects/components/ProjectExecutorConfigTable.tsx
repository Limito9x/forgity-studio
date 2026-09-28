import { useTranslation } from "react-i18next";
import { useProjectExecutorConfigs, type ProjectExecutorConfigDto } from "../hooks/useProjectExecutorConfigs";
import { useRunners, useStudioRunners, type RunnerDto } from "@/features/runners/hooks/useRunners";
import { useGetProjectById } from "@/features/projects/hooks/useProjects";
import { useDialogStore } from "@/stores/dialogStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Cpu, HardDrive, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ProjectExecutorConfigTableProps {
    projectId: string;
    studioId?: string;
}

export function ProjectExecutorConfigTable({ projectId, studioId }: ProjectExecutorConfigTableProps) {
    const { t } = useTranslation("projects");
    const { data: configs, isLoading } = useProjectExecutorConfigs(projectId);
    const { data: project } = useGetProjectById(projectId);
    const effectiveStudioId = studioId || project?.studioId;
    const { data: studioRunners } = useStudioRunners(effectiveStudioId);
    const { data: allRunners } = useRunners();
    const openDialog = useDialogStore((state) => state.openDialog);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const runners = effectiveStudioId && studioRunners ? studioRunners : (allRunners || []);
    const runnerMap = new Map<string, RunnerDto>(runners.map((r: RunnerDto) => [r.id, r]));

    const handleCopyPath = (path: string, id: string) => {
        navigator.clipboard.writeText(path);
        setCopiedId(id);
        toast.success(t("actions.copiedPath", { defaultValue: "Path copied to clipboard" }));
        setTimeout(() => setCopiedId(null), 2000);
    };

    const parseSettings = (settings: any) => {
        if (!settings) return {};
        if (typeof settings === "string") {
            try {
                return JSON.parse(settings);
            } catch {
                return {};
            }
        }
        return settings;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {t("sections.executorConfigs.title", { defaultValue: "Runner Executor Configurations" })}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("sections.executorConfigs.description", {
                            defaultValue: "Configure local project paths (.uproject, blend files) and parameters for each runner machine.",
                        })}
                    </p>
                </div>
                <Button
                    onPress={() =>
                        openDialog("upsertProjectExecutorConfig", {
                            projectId,
                            studioId: effectiveStudioId,
                        })
                    }
                    className="flex items-center gap-2 cursor-pointer"
                >
                    <Plus className="size-4" />
                    <span>{t("actions.addExecutorConfig", { defaultValue: "Add Configuration" })}</span>
                </Button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <p className="text-sm">Loading configurations...</p>
                </div>
            ) : !configs || configs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed text-center bg-card">
                    <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
                        <Cpu className="size-8" />
                    </div>
                    <h3 className="text-base font-semibold">
                        {t("empty.noExecutorConfigs", { defaultValue: "No executor configurations found" })}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
                        {t("empty.noExecutorConfigsDesc", {
                            defaultValue: "Add a runner project path (e.g. Unreal Engine .uproject) to enable automated pipeline executions.",
                        })}
                    </p>
                    <Button
                        onPress={() =>
                            openDialog("upsertProjectExecutorConfig", {
                                projectId,
                                studioId: effectiveStudioId,
                            })
                        }
                        className="flex items-center gap-2 cursor-pointer"
                    >
                        <Plus className="size-4" />
                        <span>{t("actions.addFirstConfig", { defaultValue: "Configure Now" })}</span>
                    </Button>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="divide-y divide-border">
                        {configs.map((cfg: ProjectExecutorConfigDto) => {
                            const runner = runnerMap.get(cfg.runnerId);
                            const settings = parseSettings(cfg.settings);
                            const fullPath = settings.fullPathProject || settings.project_path || "(No path set)";
                            const engineVersion = settings.engineVersion;

                            return (
                                <div
                                    key={cfg.id}
                                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="space-y-1.5 min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-foreground">
                                                {runner ? runner.name : `Runner [${cfg.runnerId.slice(0, 8)}]`}
                                            </span>
                                            {runner && (
                                                <span className="text-xs text-muted-foreground">
                                                    ({runner.machineKey})
                                                </span>
                                            )}
                                            <Badge variant="secondary" className="capitalize text-xs font-semibold">
                                                {cfg.executorKey}
                                            </Badge>
                                            {engineVersion && (
                                                <Badge variant="outline" className="text-xs">
                                                    v{engineVersion}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono bg-muted/60 px-2.5 py-1 rounded-md w-fit max-w-full">
                                            <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <span className="truncate">{fullPath}</span>
                                            {fullPath !== "(No path set)" && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyPath(fullPath, cfg.id)}
                                                    className="ml-1 text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                                                    title="Copy path"
                                                >
                                                    {copiedId === cfg.id ? (
                                                        <Check className="h-3.5 w-3.5 text-green-500" />
                                                    ) : (
                                                        <Copy className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                openDialog("upsertProjectExecutorConfig", {
                                                    projectId,
                                                    studioId: effectiveStudioId,
                                                    config: cfg,
                                                })
                                            }
                                        >
                                            <Edit2 className="h-4 w-4 mr-1.5" />
                                            {t("actions.edit", { defaultValue: "Edit" })}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() =>
                                                openDialog("deleteProjectExecutorConfig", {
                                                    projectId,
                                                    id: cfg.id,
                                                    executorKey: cfg.executorKey,
                                                })
                                            }
                                        >
                                            <Trash2 className="h-4 w-4 mr-1.5" />
                                            {t("actions.delete", { defaultValue: "Delete" })}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
