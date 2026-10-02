import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Sliders,
  Zap,
  FolderTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useUpdatePipelineTrigger,
} from "../../hooks/usePipelineGraph";
import { usePipelineFormScope } from "../../form-scope/PipelineFormScope";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import { getPinVisual, formatPinTypeLabel } from "./CustomPipelineNode";
import { toast } from "sonner";

interface PipelineStartNodeInspectorProps {
  pipelineId: string;
  projectId?: string;
  triggerType?: number | string;
  triggerWorkspaceId?: string | null;
  triggerConfig?: any;
}

export function PipelineStartNodeInspector({
  pipelineId,
  projectId = "",
  triggerType = 0,
  triggerWorkspaceId = null,
  triggerConfig = null,
}: PipelineStartNodeInspectorProps) {
  const { parameters } = usePipelineFormScope();
  const schemaInputs = useMemo(
    () => (parameters || []).filter((p) => p.kind === 1 || (p.kind as unknown) === "Input"),
    [parameters]
  );
  const { data: workspaces = [] } = useRepositories(projectId);
  const updateTriggerMutation = useUpdatePipelineTrigger(pipelineId);

  const isEventTrigger =
    triggerType === 1 ||
    triggerType === 2 ||
    triggerType === "OnResourceCreated" ||
    triggerType === "OnResourceVersionUpdated";

  const initialExtensions = useMemo(() => {
    if (!triggerConfig) return "";
    if (typeof triggerConfig === "object") {
      const cfg = triggerConfig as Record<string, any>;
      if (Array.isArray(cfg.extensions)) return cfg.extensions.join(", ");
      if (typeof cfg.extensions === "string") return cfg.extensions;
      if (typeof cfg.extension === "string") return cfg.extension;
    }
    return "";
  }, [triggerConfig]);

  const [extFilter, setExtFilter] = useState(initialExtensions);
  useEffect(() => {
    setExtFilter(initialExtensions);
  }, [initialExtensions]);

  const handleSaveExtensions = async (val: string) => {
    const exts = val
      .split(",")
      .map((s) => s.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean);
    const existingObj = triggerConfig && typeof triggerConfig === "object" ? (triggerConfig as Record<string, any>) : {};
    const updatedConfig = {
      ...existingObj,
      extensions: exts,
    };
    const currentTypeNum =
      triggerType === 1 || triggerType === "OnResourceCreated"
        ? 1
        : triggerType === 2 || triggerType === "OnResourceVersionUpdated"
        ? 2
        : 0;
    try {
      await updateTriggerMutation.mutateAsync({
        triggerType: currentTypeNum,
        triggerWorkspaceId: triggerWorkspaceId || null,
        triggerConfig: updatedConfig,
      });
      toast.success("Trigger extension filter updated");
    } catch {
      toast.error("Failed to update trigger config");
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Trigger Settings Block */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Pipeline Trigger Mode</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Execution Trigger</label>
          <Select
            selectedKey={String(triggerType)}
            onSelectionChange={async (key) => {
              const val = Number(key);
              try {
                await updateTriggerMutation.mutateAsync({
                  triggerType: val,
                  triggerWorkspaceId: val === 0 ? null : triggerWorkspaceId || null,
                  triggerConfig: triggerConfig || null,
                });
                toast.success("Trigger type updated");
              } catch {
                toast.error("Failed to update trigger");
              }
            }}
            className="w-full"
          >
            <SelectTrigger className="h-8 w-full text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="0">Manual / API Trigger</SelectItem>
              <SelectItem id="1">Workspace: On Resource Created</SelectItem>
              <SelectItem id="2">Workspace: On Resource Version Updated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isEventTrigger && (
          <div className="space-y-3 pt-1 border-t border-primary/10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <FolderTree className="h-3 w-3 text-muted-foreground" />
                <label className="text-[11px] font-medium text-muted-foreground">Monitored Workspace</label>
              </div>
              <Select
                selectedKey={triggerWorkspaceId || "none"}
                onSelectionChange={async (key) => {
                  const val = key === "none" ? null : String(key);
                  const currentTypeNum =
                    triggerType === 1 || triggerType === "OnResourceCreated"
                      ? 1
                      : triggerType === 2 || triggerType === "OnResourceVersionUpdated"
                      ? 2
                      : 0;
                  try {
                    await updateTriggerMutation.mutateAsync({
                      triggerType: currentTypeNum,
                      triggerWorkspaceId: val,
                      triggerConfig: triggerConfig || null,
                    });
                    toast.success("Trigger workspace updated");
                  } catch {
                    toast.error("Failed to update trigger workspace");
                  }
                }}
                className="w-full"
              >
                <SelectTrigger className="h-8 w-full text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem id="none">-- Select Workspace --</SelectItem>
                  {workspaces.map((w: any) => (
                    <SelectItem key={w.id} id={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                File Extension Filter <span className="text-[10px] text-muted-foreground/80">(comma separated)</span>
              </label>
              <Input
                value={extFilter}
                onChange={(e) => setExtFilter(e.target.value)}
                onBlur={(e) => handleSaveExtensions(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="e.g. blend, fbx, obj (leave empty for all)"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Pipeline Input Parameters Block */}
      {isEventTrigger && (
        <div className="rounded-xl border border-muted bg-muted/20 p-3.5 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Automatic Event Payload</p>
          <p className="text-[11px] leading-relaxed">
            When triggered by a workspace event, this pipeline automatically receives runtime inputs including:
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-mono text-foreground/80">
            <li>ResourceId (UUID string)</li>
            <li>WorkspaceId (UUID string)</li>
            <li>VersionNumber (Integer)</li>
            <li>Action ("Created" | "Updated")</li>
          </ul>
        </div>
      )}

      {/* 2. Pipeline Input Parameters Block */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Sliders className="h-3.5 w-3.5 text-primary" />
            <span>Declared Inputs ({schemaInputs.length})</span>
          </div>
        </div>

        {schemaInputs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">No input parameters configured.</p>
            <p className="text-[11px] text-muted-foreground">
              Define inputs in the Blackboard / Parameters Panel to pass data into this pipeline.
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
                        <span className="text-destructive font-bold text-xs" title="Required">
                          *
                        </span>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] font-mono px-1.5 h-4", visual.textClass)}
                    >
                      {formatPinTypeLabel(input.type, input.cardinality)}
                    </Badge>
                  </div>

                  <div className="text-[10px] text-muted-foreground font-mono flex items-center justify-between">
                    <span>Key: {input.key}</span>
                    {input.defaultValue && (
                      <span className="truncate max-w-[120px]" title={input.defaultValue}>
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


