import { Plus, Boxes } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { isExecPin } from "./types";
import { NodeCard } from "./parts/NodeCard";
import { NodeHeader } from "./parts/NodeHeader";
import { ExecPinBar } from "./parts/ExecPinBar";
import { PinInputRow, PinOutputRow } from "./parts/PinRow";
import { useDynamicPins } from "./hooks/useDynamicPins";

export function DynamicToolNodeView({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const inputs = nodeData.inputs || [];
  const outputs = nodeData.outputs || [];

  const {
    isAppend,
    isMakeArray,
    isMakeMap,
    canAddDynamicPin,
    handleAddPin,
    handleRemovePin,
  } = useDynamicPins({
    nodeId: id,
    refId: nodeData.refId,
    configValues: nodeData.configValues,
    inputs,
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

      {(dataInputs.length > 0 || dataOutputs.length > 0) && (
        <div className="p-3 text-xs">
          <div className="flex justify-between gap-6">
            <div className="flex-1 space-y-2.5">
              {dataInputs.map((pin, idx) => {
                const pinId = pin.id || `in_${idx}`;
                const hasConfig = nodeData.configValues?.[pinId] !== undefined;

                const canRemove =
                  (isAppend && pinId !== "A" && pinId !== "B" && pinId !== "Separator") ||
                  (isMakeArray && dataInputs.length > 1) ||
                  (isMakeMap && dataInputs.length > 2);

                return (
                  <PinInputRow
                    key={pinId}
                    pin={pin}
                    pinId={pinId}
                    hasConfig={hasConfig}
                    canRemove={canRemove}
                    onRemove={handleRemovePin}
                  />
                );
              })}

              {canAddDynamicPin && (
                <button
                  type="button"
                  onClick={handleAddPin}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded transition-colors mt-1"
                  title={isMakeMap ? "Add Pair" : "Add Pin"}
                >
                  <Plus className="h-3 w-3" />
                  <span>{isMakeMap ? "Add Pair" : "Add Pin"}</span>
                </button>
              )}
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
