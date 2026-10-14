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

  const isUnresolvedScript = Boolean((nodeData.metadata as Record<string, unknown> | undefined)?.["unresolvedScript"]);

  // Determine badge label
  const badgeLabel = isUnresolvedScript
    ? "Missing Script"
    : isBreakStruct
    ? structType
    : nodeData.executor
    ? nodeData.executor === "dotNet" || nodeData.executor === "builtin"
      ? "Core"
      : nodeData.executor
    : null;

  const badgeVariantClass = isUnresolvedScript
    ? "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-semibold"
    : isBreakStruct
    ? "border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10 font-semibold"
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

      {(dataInputs.length > 0 || dataOutputs.length > 0) && (
        <div className="p-3 text-xs">
          <div className="flex justify-between gap-6">
            <div className="flex-1 space-y-2.5">
              {dataInputs.map((pin, idx) => {
                const pinId = pin.id || `in_${idx}`;
                const hasConfig = nodeData.configValues?.[pinId] !== undefined;
                const pinAsset = nodeData.fileAssets?.[pinId];
                const rawPinVal = nodeData.configValues?.[pinId];
                const isUnbound =
                  pinAsset?.status === "Unbound" ||
                  (typeof rawPinVal === "object" && rawPinVal !== null && (rawPinVal as any).status === "unbound");

                return (
                  <PinInputRow
                    key={pinId}
                    pin={pin}
                    pinId={pinId}
                    hasConfig={hasConfig}
                    isUnbound={isUnbound}
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
