import { CheckCircle2 } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "../types";
import { isExecPin } from "../types";
import { NodeCard } from "../parts/NodeCard";
import { NodeHeader } from "../parts/NodeHeader";
import { ExecPinBar } from "../parts/ExecPinBar";
import { DataPinColumns } from "../parts/DataPinColumns";

export function ReturnNodeView({ id: _id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const inputs = nodeData.inputs || [];
  const execInputs = inputs.filter(isExecPin);
  const dataInputs = inputs.filter((p) => !isExecPin(p));

  const execInLabel = execInputs[0]?.label || "Complete";

  return (
    <NodeCard
      selected={selected}
      status={nodeData.executionStatus}
      executionError={nodeData.executionError}
      borderThemeClass="border-rose-500/40 bg-gradient-to-b from-rose-500/5 to-transparent"
    >
      <NodeHeader
        icon={<CheckCircle2 className="h-4 w-4" />}
        iconBgClass="bg-rose-500/20 text-rose-600 dark:text-rose-400"
        headerBgClass="border-rose-500/20 bg-rose-500/10"
        title={nodeData.label || "Return"}
        subtitle="Graph Exit Boundary"
        badgeLabel="Exit"
        badgeVariantClass="border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10 font-semibold"
        status={nodeData.executionStatus}
      />

      <ExecPinBar
        showExecIn={true}
        execInLabel={execInLabel}
        execOutputs={[]}
        execColor="#f43f5e"
      />

      <DataPinColumns
        dataInputs={dataInputs}
        dataOutputs={[]}
        configValues={nodeData.configValues}
      />
    </NodeCard>
  );
}
