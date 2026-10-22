import { Boxes } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { isExecPin } from "./types";
import { NodeCard } from "./parts/NodeCard";
import { NodeHeader } from "./parts/NodeHeader";
import { ExecPinBar } from "./parts/ExecPinBar";
import { DataPinColumns } from "./parts/DataPinColumns";
import { useNodePinResolver, useCollectionPinActions } from "./hooks";

export function DynamicToolNodeView({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const inputs = nodeData.inputs || [];
  const outputs = nodeData.outputs || [];

  // 1. Data Hook: Syncs pins from Backend POST /api/pipelines/tools/resolve-pins
  useNodePinResolver({
    nodeId: id,
    refId: nodeData.refId,
    configValues: nodeData.configValues,
    isDynamic: nodeData.isDynamic,
  });

  // 2. UI Actions Hook: Handles [+] and [x] click actions driven by capabilities
  const { canAddPin, canRemovePin, handleAddPin, handleRemovePin } =
    useCollectionPinActions({
      nodeId: id,
      capabilities: nodeData.capabilities,
    });

  const execInputs = inputs.filter(isExecPin);
  const execOutputs = outputs.filter(isExecPin);
  const dataInputs = inputs.filter((p) => !isExecPin(p));
  const dataOutputs = outputs.filter((p) => !isExecPin(p));

  const showExecIn = execInputs.length > 0;

  return (
    <NodeCard
      selected={selected}
      status={nodeData.executionStatus}
      executionError={nodeData.executionError}
      borderThemeClass="border-purple-500/40 shadow-purple-500/5"
    >
      <NodeHeader
        icon={<Boxes className="h-4 w-4" />}
        iconBgClass="bg-purple-500/20 text-purple-500"
        headerBgClass="border-purple-500/20 bg-purple-500/10"
        title={nodeData.label}
        subtitle={nodeData.refId}
        badgeLabel="Dynamic"
        badgeVariantClass="border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/10 font-semibold"
        status={nodeData.executionStatus}
      />

      <ExecPinBar
        showExecIn={showExecIn}
        execInLabel={execInputs[0]?.label || "Exec"}
        execOutputs={execOutputs}
        execColor="#a855f7"
      />

      <DataPinColumns
        dataInputs={dataInputs}
        dataOutputs={dataOutputs}
        configValues={nodeData.configValues}
        protectedPinIds={nodeData.capabilities?.protectedPinIds}
        canRemovePin={canRemovePin}
        canAddPin={canAddPin}
        onRemovePin={handleRemovePin}
        onAddPin={handleAddPin}
      />
    </NodeCard>
  );
}
