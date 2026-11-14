import { GitBranch } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { isExecPin } from "./types";
import { NodeCard } from "./parts/NodeCard";
import { NodeHeader } from "./parts/NodeHeader";
import { ExecPinBar } from "./parts/ExecPinBar";
import { PinInputRow, PinOutputRow } from "./parts/PinRow";

export function FlowControlNodeView({ id: _id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const inputs = nodeData.inputs || [];
  const outputs = nodeData.outputs || [];

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
      borderThemeClass="border-sky-500/40 shadow-sky-500/5"
    >
      <NodeHeader
        icon={<GitBranch className="h-4 w-4" />}
        iconBgClass="bg-sky-500/20 text-sky-500"
        headerBgClass="border-sky-500/20 bg-sky-500/10"
        title={nodeData.label || "Flow Control"}
        subtitle={nodeData.refId}
        badgeLabel="Flow Control"
        badgeVariantClass="border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10 font-semibold"
        status={nodeData.executionStatus}
      />

      <ExecPinBar
        showExecIn={showExecIn}
        execInLabel={execInputs[0]?.label || "Exec"}
        execOutputs={execOutputs}
        execColor="#0ea5e9"
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
