import { Component } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "../types";
import { NodeCard } from "../parts/NodeCard";
import { NodeHeader } from "../parts/NodeHeader";
import { ExecPinBar } from "../parts/ExecPinBar";
import { DataPinColumns } from "../parts/DataPinColumns";
import { useSplitPins } from "../hooks/useSplitPins";

export function StructNodeView({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const { execInputs, execOutputs, dataInputs, dataOutputs, showExecIn } = useSplitPins(
    nodeData.inputs,
    nodeData.outputs
  );

  const structName = (nodeData.configValues?.StructType as string) || "Not selected";

  return (
    <NodeCard
      selected={selected}
      status={nodeData.executionStatus}
      executionError={nodeData.executionError}
      borderThemeClass="border-amber-500/40 bg-gradient-to-b from-amber-500/5 to-transparent"
    >
      <NodeHeader
        icon={<Component className="h-4 w-4" />}
        iconBgClass="bg-amber-500/20 text-amber-600 dark:text-amber-400"
        headerBgClass="border-amber-500/20 bg-amber-500/10"
        title={nodeData.label || nodeData.refId}
        subtitle={`Struct: ${structName}`}
        badgeLabel="Struct"
        badgeVariantClass="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-semibold"
        status={nodeData.executionStatus}
      />

      <ExecPinBar
        showExecIn={showExecIn}
        execInLabel={execInputs[0]?.label || "Exec"}
        execOutputs={execOutputs}
        execColor="#f59e0b"
      />

      <DataPinColumns
        dataInputs={dataInputs}
        dataOutputs={dataOutputs}
        configValues={nodeData.configValues}
        fileAssets={nodeData.fileAssets}
      />
    </NodeCard>
  );
}
