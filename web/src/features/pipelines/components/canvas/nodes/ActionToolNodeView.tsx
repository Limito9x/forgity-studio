import { Box, FileCode } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { isExecPin } from "./types";
import { NodeCard } from "./parts/NodeCard";
import { NodeHeader } from "./parts/NodeHeader";
import { ExecPinBar } from "./parts/ExecPinBar";
import { PinInputRow, PinOutputRow } from "./parts/PinRow";

export function ActionToolNodeView({ id: _id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const inputs = nodeData.inputs || [];
  const outputs = nodeData.outputs || [];

  const rawRefId = (nodeData.refId || "").toLowerCase();
  const isBreakStruct = rawRefId === "breakstruct";
  const structType = nodeData.configValues?.["StructType"] || "Resource";

  const execInputs = inputs.filter(isExecPin);
  const execOutputs = outputs.filter(isExecPin);
  const dataInputs = inputs.filter((p) => !isExecPin(p));
  const dataOutputs = outputs.filter((p) => !isExecPin(p));

  const showExecIn = execInputs.length > 0;

  // Determine badge label
  const badgeLabel = isBreakStruct
    ? structType
    : nodeData.executor
    ? nodeData.executor === "dotNet" || nodeData.executor === "builtin"
      ? "Core"
      : nodeData.executor
    : null;

  return (
    <NodeCard
      selected={selected}
      status={nodeData.executionStatus}
      executionError={nodeData.executionError}
    >
      <NodeHeader
        icon={nodeData.category ? <Box className="h-4 w-4" /> : <FileCode className="h-4 w-4" />}
        iconBgClass="bg-blue-500/15 text-blue-500"
        headerBgClass="border-border/70 bg-muted/50"
        title={nodeData.label}
        subtitle={nodeData.refId}
        badgeLabel={badgeLabel}
        badgeVariantClass={isBreakStruct ? "border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10 font-semibold" : "capitalize"}
        status={nodeData.executionStatus}
      />

      <ExecPinBar
        showExecIn={showExecIn}
        execInLabel={execInputs[0]?.label || "Exec"}
        execOutputs={execOutputs}
        execColor="#3b82f6"
      />

      {(dataInputs.length > 0 || dataOutputs.length > 0) && (
        <div className="p-3 text-xs">
          <div className="flex justify-between gap-6">
            <div className="flex-1 space-y-2.5">
              {dataInputs.map((pin, idx) => {
                const pinId = pin.id || `in_${idx}`;
                const hasConfig = nodeData.configValues?.[pinId] !== undefined;

                return (
                  <PinInputRow
                    key={pinId}
                    pin={pin}
                    pinId={pinId}
                    hasConfig={hasConfig}
                  />
                );
              })}
            </div>

            <div className="flex-1 space-y-2.5 text-right">
              {dataOutputs.map((pin, idx) => {
                const pinId = pin.id || `out_${idx}`;
                return (
                  <PinOutputRow
                    key={pinId}
                    pin={pin}
                    pinId={pinId}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </NodeCard>
  );
}
