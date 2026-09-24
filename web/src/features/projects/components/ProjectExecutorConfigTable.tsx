import { useTranslation } from "react-i18next";
import { useProjectExecutorConfigs, type ProjectExecutorConfigDto } from "../hooks/useProjectExecutorConfigs";
import { useRunners, type RunnerDto } from "@/features/runners/hooks/useRunners";
import { useDialogStore } from "@/stores/dialogStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Cpu, HardDrive, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ProjectExecutorConfigTableProps {
    projectId: string;
}

export function ProjectExecutorConfigTable({ projectId }: ProjectExecutorConfigTableProps) {
    const { t } = useTranslation("projects");
    const { data: configs, isLoading } = useProjectExecutorConfigs(projectId);
    const { data: runners } = useRunners();
    const openDialog = useDialogStore((state) => state.openDialog);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const runnerMap = new Map<string, RunnerDto>((runners || []).map((r: RunnerDto) => [r.id, r]));

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
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight">
                        {t("sections.executorConfigs.title", { defaultValue: "Agent Executor Configurations" })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("sections.executorConfigs.description", {
                            defaultValue: "Configure local project paths (.uproject, blend files) and parameters for each target machine.",
                        })}
                    </p>
                </div>
                <Button
                    onClick={() =>
                        openDialog("upsertProjectExecutorConfig", {
                            projectId,
                        })
                    }
                    className="gap-2"
                >
                    <Plus className="h-4 w-4" />
                    {t("actions.addExecutorConfig", { defaultValue: "Add Configuration" })}
                </Button>
            </div>

            {isLoading ? (
                <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
                    <p className="text-sm text-muted-foreground">Loading configurations...</p>
                </div>
            ) : !configs || configs.length === 0 ? (
                <div className="flex h-44 flex-col items-center justify-center space-y-3 rounded-xl border border-dashed border-border bg-card p-6 text-center">
                    <Cpu className="h-10 w-10 text-muted-foreground/60" />
                    <div className="space-y-1">
                        <p className="text-sm font-medium">
                            {t("empty.noExecutorConfigs", { defaultValue: "No executor configurations found" })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t("empty.noExecutorConfigsDesc", {
                                defaultValue: "Add an agent project path (e.g. Unreal Engine .uproject) to enable automated pipeline executions.",
                            })}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            openDialog("upsertProjectExecutorConfig", {
                                projectId,
                            })
                        }
                    >
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        {t("actions.addFirstConfig", { defaultValue: "Configure Now" })}
                    </Button>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="divide-y divide-border">
                        {configs.map((cfg: ProjectExecutorConfigDto) => {
                            const runner = runnerMap.get(cfg.agentId);
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
                                                {runner ? runner.name : `Runner [${cfg.agentId.slice(0, 8)}]`}
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
