import { memo } from "react";
import { PlayCircle, CheckCircle2, Variable } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PipelineParameterDto } from "../../../hooks/usePipelineGraph";
import { ParameterRowItem } from "./ParameterRowItem";
import type { ParameterTab } from "./types";

interface ParameterListProps {
  activeTab: ParameterTab;
  items: PipelineParameterDto[];
  onEdit: (param: PipelineParameterDto) => void;
  onDelete: (key: string) => void;
  onSpawnCapsule: (key: string, kind: "Variable" | "Runner" | "Repository" | "Workspace" | "Context", type: any) => void;
  onSpawnAction: (toolKey: "SetVariable", varName: string) => void;
}

export const ParameterList = memo(function ParameterList({
  activeTab,
  items,
  onEdit,
  onDelete,
  onSpawnCapsule,
  onSpawnAction,
}: ParameterListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground/60 border border-dashed rounded-lg">
        {activeTab === "inputs" && (
          <>
            <PlayCircle className="h-7 w-7 mb-2 stroke-1 text-emerald-500/50" />
            <span className="text-xs font-medium">No inputs declared yet</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Inputs provide contract values into the Start node.
            </span>
          </>
        )}
        {activeTab === "outputs" && (
          <>
            <CheckCircle2 className="h-7 w-7 mb-2 stroke-1 text-sky-500/50" />
            <span className="text-xs font-medium">No outputs declared yet</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Outputs are collected at the Return node and snapshotted to ExecutionState.
            </span>
          </>
        )}
        {activeTab === "variables" && (
          <>
            <Variable className="h-7 w-7 mb-2 stroke-1 text-violet-500/50" />
            <span className="text-xs font-medium">No variables declared</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Variables form the shared memory blackboard of this pipeline.
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 pr-2">
      <div className="space-y-2">
        {items.map((param) => (
          <ParameterRowItem
            key={param.key}
            param={param}
            activeTab={activeTab}
            onEdit={onEdit}
            onDelete={onDelete}
            onSpawnCapsule={onSpawnCapsule}
            onSpawnAction={onSpawnAction}
          />
        ))}
      </div>
    </ScrollArea>
  );
});
