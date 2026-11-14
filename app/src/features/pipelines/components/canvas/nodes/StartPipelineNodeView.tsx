import { PlayCircle } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { isExecPin } from "./types";
import { NodeCard } from "./parts/NodeCard";
import { NodeHeader } from "./parts/NodeHeader";
import { ExecPinBar } from "./parts/ExecPinBar";
import { PinOutputRow } from "./parts/PinRow";

export function StartPipelineNodeView({ id: _id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const outputs = nodeData.outputs || [];
  const execOutputs = outputs.filter(isExecPin);
  const dataOutputs = outputs.filter((p) => !isExecPin(p));

  // If no explicit exec output is defined, provide standard start run exec handle
  const effectiveExecOutputs = execOutputs.length > 0
    ? execOutputs
    : [{ id: "exec_out", label: "Start", isRequired: false }];

  return (
    <NodeCard
      selected={selected}
      status={nodeData.executionStatus}
      executionError={nodeData.executionError}
      borderThemeClass="border-emerald-500/40 bg-gradient-to-b from-emerald-500/5 to-transparent"
    >
      <NodeHeader
        icon={<PlayCircle className="h-4 w-4 fill-current/20" />}
        iconBgClass="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
        headerBgClass="border-emerald-500/20 bg-emerald-500/10"
        title="Start Pipeline"
        subtitle={nodeData.refId || "Start"}
        badgeLabel="Entry"
        badgeVariantClass="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
        status={nodeData.executionStatus}
      />

      <ExecPinBar
        showExecIn={false}
        execOutputs={effectiveExecOutputs as any}
        execColor="#10b981"
      />

      {dataOutputs.length > 0 && (
        <div className="p-3 text-xs">
          <div className="space-y-2.5 text-right">
            {dataOutputs.map((pin, idx) => (
              <PinOutputRow
                key={pin.id || `out_${idx}`}
                pin={pin}
                pinId={pin.id || `out_${idx}`}
              />
            ))}
          </div>
        </div>
      )}
    </NodeCard>
  );
}
