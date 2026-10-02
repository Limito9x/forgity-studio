import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Variable, Laptop, FolderGit2, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPinVisual } from "./CustomPipelineNode";

export interface CapsuleNodeData extends Record<string, unknown> {
  refId: string;
  key: string;
  label: string;
  category?: string;
  pinType: string | number;
  cardinality?: string | number;
  structType?: string | null;
  pipelineId?: string;
  description?: string | null;
}

export const CapsuleNode = memo(function CapsuleNode({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as unknown as CapsuleNodeData;
  const pinType = nodeData.pinType ?? 0;
  const visual = getPinVisual(pinType);

  const isInput = nodeData.category === "Input" || nodeData.refId === "GetInput";
  const isRunner =
    nodeData.category === "Runner" ||
    nodeData.refId === "RunnerContext" ||
    nodeData.structType === "Runner";
  const isWorkspace = nodeData.category === "Workspace" || nodeData.refId === "WorkspaceContext";

  const IconComponent = isInput ? PlayCircle : isRunner ? Laptop : isWorkspace ? FolderGit2 : Variable;
  const iconColor = isInput
    ? "text-emerald-400"
    : isRunner
    ? "text-sky-400"
    : isWorkspace
    ? "text-amber-400"
    : "text-violet-400";

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 h-8 px-3 rounded-full border shadow-sm transition-all duration-150 select-none",
        "bg-card/90 backdrop-blur-md border-border/70 hover:border-primary/60 hover:shadow-md",
        selected && "ring-2 ring-primary border-primary shadow-md"
      )}
      title={nodeData.description || `${nodeData.label || nodeData.key} (${visual.label})`}
    >
      <div className={cn("p-1 rounded-full bg-muted/60", iconColor)}>
        <IconComponent className="w-3.5 h-3.5" />
      </div>

      <div className="flex items-center gap-1.5 min-w-0 pr-1">
        <span className="font-mono text-xs font-semibold text-foreground tracking-tight truncate max-w-[120px]">
          {nodeData.label || nodeData.key}
        </span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.2 rounded-full font-medium leading-tight",
            visual.bgClass,
            "text-white"
          )}
        >
          {visual.label}
        </span>
      </div>

      {/* Single Data Output Handle on the Right - Enlarged for easy snapping */}
      <Handle
        type="source"
        position={Position.Right}
        id={nodeData.key || "Value"}
        className={cn(
          "w-3.5 h-3.5 rounded-full border-2 border-background shadow-xs transition-transform hover:scale-135 !right-[-7px] !cursor-crosshair",
          visual.bgClass
        )}
      />
    </div>
  );
});
