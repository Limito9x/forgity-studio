import { Key } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "../types";
import { NodeCard } from "../parts/NodeCard";
import { NodeHeader } from "../parts/NodeHeader";
import { PinOutputRow } from "../parts/PinRow";
import { useNodeDefinition } from "../../NodeDefinitions";

export function ConstantNodeView({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CustomPipelineNodeData;
  const definition = useNodeDefinition(nodeData.kind, nodeData.refId);
  const outputs = nodeData.outputs || [];

  const caps = definition?.capabilities as Record<string, any> | undefined;
  const scope = caps?.scope || "General";
  const constantKey = caps?.constantKey || nodeData.refId.replace(/^local:constant:/, "");
  const resolvedValue = caps?.resolvedValue ?? "";
  const resolvedUnrealPath = caps?.resolvedUnrealPath ?? "";

  const themeClass =
    scope === "Unreal"
      ? "border-indigo-500/40 bg-gradient-to-b from-indigo-500/10 to-transparent"
      : scope === "Blender"
        ? "border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-transparent"
        : "border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-transparent";

  const badgeTheme =
    scope === "Unreal"
      ? "border-indigo-500/30 text-indigo-400 bg-indigo-500/10"
      : scope === "Blender"
        ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
        : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10";

  return (
    <NodeCard
      selected={selected}
      status={nodeData.executionStatus}
      executionError={nodeData.executionError}
      borderThemeClass={themeClass}
      className="min-w-[220px]"
    >
      <NodeHeader
        icon={<Key className="h-4 w-4" />}
        iconBgClass={badgeTheme}
        headerBgClass="border-border/40 bg-muted/40"
        title={constantKey}
        subtitle={`Constant (${scope})`}
        badgeLabel="Pure"
        badgeVariantClass="border-border text-muted-foreground bg-muted/30 font-mono"
        status={nodeData.executionStatus}
      />

      {/* Value Summary Display */}
      <div className="px-3 pt-2 text-[10px] font-mono text-muted-foreground truncate" title={String(resolvedValue)}>
        <span className="truncate">
          {String(resolvedValue) || "(empty)"}
        </span>
      </div>

      {scope === "Unreal" && resolvedUnrealPath && (
        <div className="px-3 pt-0.5 text-[9px] font-mono text-indigo-400 truncate" title={resolvedUnrealPath}>
          🎮 {resolvedUnrealPath}
        </div>
      )}

      {/* Pure Data Output Pins */}
      {outputs.length > 0 && (
        <div className="p-3 text-xs">
          <div className="space-y-2 text-right">
            {outputs.map((pin, idx) => (
              <PinOutputRow
                key={pin.id || `out_${idx}`}
                pin={pin}
                pinId={pin.id || `out_${idx}`}
              />
            ))}
          </div>
        </div>
      )}
    </NodeCard>
  );
}

