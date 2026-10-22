import { Boxes } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { useSplitPins } from "./hooks/useSplitPins";
import { useNodeDefinition } from "../NodeDefinitions";
import { NodeCard } from "./parts/NodeCard";
import { NodeHeader } from "./parts/NodeHeader";
import { ExecPinBar } from "./parts/ExecPinBar";
import { DataPinColumns } from "./parts/DataPinColumns";
import { useCollectionPinActions } from "./hooks";

export function CollectionNodeView({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const definition = useNodeDefinition(nodeData.kind, nodeData.refId);
  // 2. UI Actions Hook: Handles [+] and [x] click actions driven by capabilities
  const { canAddPin, canRemovePin, handleAddPin, handleRemovePin } =
    useCollectionPinActions({
      nodeId: id,
      capabilities: definition?.capabilities,
    });

  const { execInputs, execOutputs, dataInputs, dataOutputs, showExecIn } = useSplitPins(nodeData.inputs, nodeData.outputs);

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
        badgeLabel="Collection"
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
        fileAssets={nodeData.fileAssets}
        protectedPinIds={definition?.capabilities?.protectedPinIds}
        canRemovePin={canRemovePin}
        canAddPin={canAddPin}
        onRemovePin={handleRemovePin}
        onAddPin={handleAddPin}
      />
    </NodeCard>
  );
}
