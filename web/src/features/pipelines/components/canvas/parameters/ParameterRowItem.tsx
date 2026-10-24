import { memo } from "react";
import { GripVertical, Pencil, Trash2, Pill, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineParameterDto } from "../../../hooks/usePipelineGraph";
import { getTypeStyle, type ParameterTab } from "./types";

interface ParameterRowItemProps {
  param: PipelineParameterDto;
  activeTab: ParameterTab;
  onEdit: (param: PipelineParameterDto) => void;
  onDelete: (key: string) => void;
  onSpawnCapsule: (key: string, kind: "Variable" | "Runner" | "Repository" | "Workspace" | "Context", type: any) => void;
  onSpawnAction: (toolKey: "SetVariable", varName: string) => void;
}

export const ParameterRowItem = memo(function ParameterRowItem({
  param,
  activeTab,
  onEdit,
  onDelete,
  onSpawnCapsule,
  onSpawnAction,
}: ParameterRowItemProps) {
  const style = getTypeStyle(param.type, param.cardinality, param.structType);

  if (activeTab === "inputs") {
    return (
      <div className="group relative flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 hover:border-emerald-500/40 hover:shadow-sm transition-all">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs font-semibold text-foreground truncate">
              {param.label || param.key}
            </span>
            {param.isRequired && (
              <span className="text-[10px] text-amber-500 font-semibold" title="Required parameter">
                *
              </span>
            )}
          </div>
          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 border font-mono", style.color)}>
            {style.label}
          </Badge>
        </div>

        {param.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{param.description}</p>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              onPress={() => onSpawnCapsule(param.key, "Context", param.type)}
            >
              <span>Capsule</span>
            </Button>
            <span className="text-[10px] text-muted-foreground/70 font-mono truncate max-w-[90px]">
              Def: {String(param.defaultValue ?? "none")}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onPress={() => onEdit(param)}
              aria-label="Edit input parameter"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive"
              onPress={() => onDelete(param.key)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "outputs") {
    return (
      <div className="group relative flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 hover:border-sky-500/40 hover:shadow-sm transition-all">
        <div className="flex items-center justify-between gap-1.5">
          <span className="font-mono text-xs font-semibold text-foreground truncate">
            {param.label || param.key}
          </span>
          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 border font-mono", style.color)}>
            {style.label}
          </Badge>
        </div>
        {param.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{param.description}</p>
        )}
        <div className="flex items-center justify-end gap-0.5 pt-1 border-t border-border/30">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onPress={() => onEdit(param)}
            aria-label="Edit output parameter"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onPress={() => onDelete(param.key)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // activeTab === "variables"
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/pipeline-variable", JSON.stringify(param));
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      className="group relative flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 hover:border-violet-500/40 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground" />
          <span className="font-mono text-xs font-semibold text-foreground truncate">
            {param.label || param.key}
          </span>
        </div>
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 border font-mono", style.color)}>
          {style.label}
        </Badge>
      </div>

      {param.description && (
        <p className="text-[10px] text-muted-foreground line-clamp-2 pl-5">{param.description}</p>
      )}

      {/* Action Buttons: 💊 Capsule Getter | ⚡ Action Setter */}
      <div className="flex items-center justify-between pt-1 border-t border-border/30 pl-5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] gap-1 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
            onPress={() => onSpawnCapsule(param.key, "Variable", param.type)}
          >
            <Pill className="w-2.5 h-2.5" />
            <span>Get</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] gap-1 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
            onPress={() => onSpawnAction("SetVariable", param.key)}
          >
            <Zap className="w-2.5 h-2.5" />
            <span>Set</span>
          </Button>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onPress={() => onEdit(param)}
            aria-label="Edit variable parameter"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onPress={() => onDelete(param.key)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
});
