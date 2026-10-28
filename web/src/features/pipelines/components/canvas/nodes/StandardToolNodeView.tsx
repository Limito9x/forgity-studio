import { Box, FileCode } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { useSplitPins } from "./hooks/useSplitPins";
import { NodeCard } from "./parts/NodeCard";
import { NodeHeader } from "./parts/NodeHeader";
import { ExecPinBar } from "./parts/ExecPinBar";
import { DataPinColumns } from "./parts/DataPinColumns";
import { useNodeDefinition } from "../NodeDefinitions";

export function StandardToolNodeView({ id: _id, data, selected, missingDefinition = false }: NodeProps & { missingDefinition?: boolean }) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const definition = useNodeDefinition(nodeData.kind, nodeData.refId);
  const executor = definition?.executor ?? nodeData.executor;
  const { execInputs, execOutputs, dataInputs, dataOutputs, showExecIn } = useSplitPins(nodeData.inputs, nodeData.outputs);
  const isUnresolvedScript = Boolean((nodeData.metadata as Record<string, unknown> | undefined)?.["unresolvedScript"]);

  // Determine badge label
  const badgeLabel = isUnresolvedScript
    ? "Missing Script"
    : missingDefinition
    ? "Missing Definition"
    : executor
    ? executor === "dotNet" || executor === "builtin"
      ? "Core"
      : executor
    : null;

  const badgeVariantClass = isUnresolvedScript
    ? "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-semibold"
    : "capitalize";

  return (
    <NodeCard
      selected={selected}
      status={nodeData.executionStatus}
      executionError={nodeData.executionError}
    >
      <NodeHeader
        icon={nodeData.category ? <Box className="h-4 w-4" /> : <FileCode className="h-4 w-4" />}
        iconBgClass={isUnresolvedScript ? "bg-amber-500/15 text-amber-500" : "bg-blue-500/15 text-blue-500"}
        headerBgClass="border-border/70 bg-muted/50"
        title={nodeData.label}
        subtitle={nodeData.refId}
        badgeLabel={badgeLabel}
        badgeVariantClass={badgeVariantClass}
        status={nodeData.executionStatus}
      />

      <ExecPinBar
        showExecIn={showExecIn}
        execInLabel={execInputs[0]?.label || "Exec"}
        execOutputs={execOutputs}
        execColor="#3b82f6"
      />

      <DataPinColumns dataInputs={dataInputs} dataOutputs={dataOutputs} configValues={nodeData.configValues} fileAssets={nodeData.fileAssets} />
    </NodeCard>
  );
}
