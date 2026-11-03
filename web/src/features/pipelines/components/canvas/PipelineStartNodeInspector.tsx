import { useMemo, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Sliders,
  Zap,
  FolderGit2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Settings2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdatePipelineTrigger } from "../../hooks/usePipelineGraph";
import { usePipelineFormScope } from "../../form-scope/PipelineFormScope";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import { TagsInput } from "@/components/custom-ui/inputs/tags-input/TagsInput";
import { getPinVisual, formatPinTypeLabel } from "./nodes/types";
import { toast } from "sonner";
import { PipelineTriggerType } from "@/gen/model";

interface PipelineStartNodeInspectorProps {
  pipelineId: string;
  projectId?: string;
  triggerType?: number | string;
  triggerConfig?: any;
}

export function PipelineStartNodeInspector({
  pipelineId,
  projectId = "",
  triggerType = 0,
  triggerConfig = null,
}: PipelineStartNodeInspectorProps) {
  const { parameters } = usePipelineFormScope();

  const schemaInputs = useMemo(
    () =>
      (parameters || []).filter(
        (p) => p.kind === "Input" || (p.kind as any) === 1,
      ),
    [parameters],
  );

  const { data: repositories = [] } = useRepositories(projectId);
  const updateTriggerMutation = useUpdatePipelineTrigger(pipelineId);

  const normalizedTriggerType: PipelineTriggerType =
    (triggerType as any) === 1 || triggerType === PipelineTriggerType.OnResourceCreated
      ? PipelineTriggerType.OnResourceCreated
      : (triggerType as any) === 2 || triggerType === PipelineTriggerType.OnResourceVersionUpdated
        ? PipelineTriggerType.OnResourceVersionUpdated
        : PipelineTriggerType.Manual;

  const [selectedTriggerKey, setSelectedTriggerKey] = useState<string>(
    normalizedTriggerType,
  );

  useEffect(() => {
    setSelectedTriggerKey(normalizedTriggerType);
  }, [normalizedTriggerType]);

  const isEventTrigger =
    selectedTriggerKey === PipelineTriggerType.OnResourceCreated ||
    selectedTriggerKey === PipelineTriggerType.OnResourceVersionUpdated ||
    normalizedTriggerType === PipelineTriggerType.OnResourceCreated ||
    normalizedTriggerType === PipelineTriggerType.OnResourceVersionUpdated;

  // 1. Trigger Mode (Always vs AskBefore)
  const currentTriggerMode = useMemo(() => {
    if (!triggerConfig || typeof triggerConfig !== "object") return "Always";
    return (triggerConfig as Record<string, any>).triggerMode || "Always";
  }, [triggerConfig]);

  // 2. Allow All Repositories flag
  const allowAllRepositories = useMemo(() => {
    if (!triggerConfig || typeof triggerConfig !== "object") return false;
    return (triggerConfig as Record<string, any>).allowAllRepositories === true;
  }, [triggerConfig]);

  // 3. Selected Repository IDs (Array with legacy single string fallback)
  const selectedRepoIds = useMemo<string[]>(() => {
    if (!triggerConfig || typeof triggerConfig !== "object") return [];
    const cfg = triggerConfig as Record<string, any>;
    if (Array.isArray(cfg.repositoryIds)) return cfg.repositoryIds;
    if (typeof cfg.repositoryId === "string" && cfg.repositoryId.trim()) {
      return [cfg.repositoryId.trim()];
    }
    return [];
  }, [triggerConfig]);

  // 4. File Extension Filter
  const currentExtensions = useMemo(() => {
    if (!triggerConfig || typeof triggerConfig !== "object") return [];
    const cfg = triggerConfig as Record<string, any>;
    if (Array.isArray(cfg.extensions)) return cfg.extensions;
    if (typeof cfg.extensions === "string") return [cfg.extensions];
    if (typeof cfg.extension === "string") return [cfg.extension];
    return [];
  }, [triggerConfig]);

  // Shared Config Updater Helper
  const handleUpdateConfig = async (partialConfig: Record<string, any>, successMsg: string) => {
    const existingObj =
      triggerConfig && typeof triggerConfig === "object"
        ? (triggerConfig as Record<string, any>)
        : {};

    const updatedConfig = {
      ...existingObj,
      ...partialConfig,
    };

    try {
      await updateTriggerMutation.mutateAsync({
        triggerType: normalizedTriggerType,
        triggerConfig: updatedConfig,
      });
      toast.success(successMsg);
    } catch {
      toast.error("Failed to update trigger configuration");
    }
  };

  const handleToggleRepository = async (repoId: string) => {
    const nextIds = selectedRepoIds.includes(repoId)
      ? selectedRepoIds.filter((id) => id !== repoId)
      : [...selectedRepoIds, repoId];

    await handleUpdateConfig({ repositoryIds: nextIds }, "Trigger repositories updated");
  };

  const handleSelectAllRepositories = async () => {
    const allIds = repositories.map((r: any) => r.id);
    await handleUpdateConfig({ repositoryIds: allIds }, "All repositories selected");
  };

  const handleClearAllRepositories = async () => {
    await handleUpdateConfig({ repositoryIds: [] }, "All repositories cleared");
  };

  return (
    <div className="space-y-4">
      {/* 1. Trigger Settings Block */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Pipeline Trigger Mode
          </span>
        </div>

        {/* 1.1 Trigger Event Type */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">
            Execution Trigger
          </label>

          <Select
            selectedKey={selectedTriggerKey}
            onSelectionChange={async (key) => {
              if (key === null || key === undefined) return;
              const keyStr = String(key);
              setSelectedTriggerKey(keyStr);
              const val = keyStr as PipelineTriggerType;

              try {
                await updateTriggerMutation.mutateAsync({
                  triggerType: val,
                  triggerConfig:
                    val === PipelineTriggerType.Manual ? null : triggerConfig || {},
                });
                toast.success("Trigger type updated");
              } catch {
                setSelectedTriggerKey(normalizedTriggerType);
                toast.error("Failed to update trigger");
              }
            }}
            className="w-full"
          >
            <SelectTrigger className="h-8 w-full text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id={PipelineTriggerType.Manual}>Manual / API Trigger</SelectItem>
              <SelectItem id={PipelineTriggerType.OnResourceCreated}>
                Repository: On Resource / Draft Created
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isEventTrigger && (
          <div className="space-y-3.5 pt-2 border-t border-primary/10">
            {/* 1.2 Execution Mode (Always vs AskBefore) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3 w-3 text-muted-foreground" />
                <label className="text-[11px] font-medium text-muted-foreground">
                  Trigger Execution Mode
                </label>
              </div>

              <Select
                selectedKey={currentTriggerMode}
                onSelectionChange={(key) => {
                  if (!key) return;
                  handleUpdateConfig(
                    { triggerMode: String(key) },
                    "Trigger execution mode updated"
                  );
                }}
                className="w-full"
              >
                <SelectTrigger className="h-8 w-full text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem id="Always">
                    Always (Full Auto: queue on sync)
                  </SelectItem>
                  <SelectItem id="AskBefore">
                    Ask Before Sync (Require confirmation in Sync UI)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 1.3 Repository Scoping (Allow All vs Multi-repo) */}
            <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-2.5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <FolderGit2 className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-semibold text-foreground">
                      Monitored Repositories
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Listen to changes across project repositories
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-medium text-muted-foreground cursor-pointer">
                    All Repos
                  </label>
                  <Switch
                    size="sm"
                    isSelected={allowAllRepositories}
                    onChange={(val) =>
                      handleUpdateConfig(
                        { allowAllRepositories: val },
                        val
                          ? "Trigger enabled for all repositories in project"
                          : "Trigger restricted to selected repositories"
                      )
                    }
                  />
                </div>
              </div>

              {allowAllRepositories ? (
                <div className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span>Listens to all repositories in this project matching extension filters.</span>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      Selected ({selectedRepoIds.length} / {repositories.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllRepositories}
                        className="hover:text-primary transition-colors cursor-pointer"
                      >
                        Select All
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={handleClearAllRepositories}
                        className="hover:text-destructive transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {repositories.map((repo: any) => {
                      const isSelected = selectedRepoIds.includes(repo.id);
                      return (
                        <div
                          key={repo.id}
                          onClick={() => handleToggleRepository(repo.id)}
                          className={cn(
                            "flex items-center justify-between px-2 py-1 rounded text-xs transition-colors cursor-pointer border",
                            isSelected
                              ? "bg-primary/10 border-primary/30 text-foreground font-medium"
                              : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/60"
                          )}
                        >
                          <span className="truncate pr-2">{repo.name}</span>
                          {isSelected && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!allowAllRepositories && selectedRepoIds.length === 0 && (
                    <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-[10px] text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        No repositories selected. Trigger is currently dormant and will not execute on sync.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 1.4 Extension Filter */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                File Extension Filter{" "}
                <span className="text-[10px] text-muted-foreground/80">
                  (leave empty for all)
                </span>
              </label>

              <TagsInput
                value={currentExtensions}
                onChange={(exts) =>
                  handleUpdateConfig({ extensions: exts }, "Trigger extension filter updated")
                }
                placeholder="e.g. blend, fbx, obj"
                transformTag={(tag) =>
                  tag.replace(/^\.+/, "").toLowerCase().trim()
                }
                renderTagLabel={(tag) => `.${tag}`}
                className="text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Pipeline Event Payload Block */}
      {isEventTrigger && (
        <div className="rounded-xl border border-muted bg-muted/20 p-3.5 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 text-foreground font-medium">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Automatic Event Outputs</span>
          </div>

          <p className="text-[11px] leading-relaxed">
            When triggered by a repository event, this Start node automatically
            provides per-resource queue outputs:
          </p>

          <ul className="list-disc pl-4 space-y-1 text-[11px] font-mono text-foreground/80">
            <li>
              <span className="font-semibold text-primary">Resource</span>: Single Resource item (primary 1-File-1-Job queue target)
            </li>
            <li>
              <span className="font-semibold text-muted-foreground">Resources</span>: Array with single item (backwards compatible)
            </li>
            <li>
              <span className="font-semibold text-muted-foreground">Workstation</span>: Target Workstation / Runner context
            </li>
          </ul>
        </div>
      )}

      {/* 3. Pipeline Input Parameters Block */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Sliders className="h-3.5 w-3.5 text-primary" />
            <span>Declared Inputs ({schemaInputs.length})</span>
          </div>
        </div>

        {schemaInputs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">
              No input parameters configured.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Define inputs in the Blackboard / Parameters Panel to pass data
              into this pipeline.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {schemaInputs.map((input) => {
              const visual = getPinVisual(input.type);

              return (
                <div
                  key={input.id}
                  className="rounded-lg border border-border/70 bg-card p-3 space-y-2 shadow-sm group/item"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {input.label || input.key}
                      </span>

                      {input.isRequired && (
                        <span
                          className="text-destructive font-bold text-xs"
                          title="Required"
                        >
                          *
                        </span>
                      )}
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-mono px-1.5 h-4",
                        visual.textClass,
                      )}
                    >
                      {formatPinTypeLabel(input.type, input.cardinality)}
                    </Badge>
                  </div>

                  <div className="text-[10px] text-muted-foreground font-mono flex items-center justify-between">
                    <span>Key: {input.key}</span>

                    {input.defaultValue && (
                      <span
                        className="truncate max-w-[120px]"
                        title={input.defaultValue}
                      >
                        Default: {input.defaultValue}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
