import { AlertTriangle, Component } from "lucide-react";
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

  const selectedStructType = (nodeData.configValues?.StructType as string)?.trim() || "";
  const isStructSelected = Boolean(selectedStructType);
  const structName = isStructSelected ? selectedStructType : "Not selected";

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

      {!isStructSelected && (
        <div className="mx-3 mt-2.5 mb-1 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Select a Struct Type in Inspector</span>
        </div>
      )}

      <DataPinColumns
        dataInputs={dataInputs}
        dataOutputs={dataOutputs}
        configValues={nodeData.configValues}
        fileAssets={nodeData.fileAssets}
      />
    </NodeCard>
  );
}
