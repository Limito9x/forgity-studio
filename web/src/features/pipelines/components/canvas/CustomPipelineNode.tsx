import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./nodes/types";
import { StartPipelineNodeView } from "./nodes/StartPipelineNodeView";
import { FlowControlNodeView } from "./nodes/FlowControlNodeView";
import { DynamicToolNodeView } from "./nodes/DynamicToolNodeView";
import { ActionToolNodeView } from "./nodes/ActionToolNodeView";

// Re-export all types and visual helpers for backward compatibility across the canvas
export * from "./nodes/types";

/**
 * CustomPipelineNode: Strategy Dispatcher cho các loại Action/Step Node trên Canvas.
 * Không nhồi nhét if/else render UI vào một file khổng lồ; thay vào đó phân giải
 * ngữ cảnh node để điều phối (dispatch) tới Strategy Component chuyên biệt tương ứng.
 */
export const CustomPipelineNode = memo((props: NodeProps) => {
  const nodeData = props.data as unknown as CustomPipelineNodeData;
  const rawKind = (nodeData.kind || "").toLowerCase();
  const rawRefId = (nodeData.refId || "").toLowerCase();

  // 1. Start Node Strategy (Pipeline Entry point)
  if (rawKind === "start" || rawRefId === "start" || rawRefId === "beginexecute") {
    return <StartPipelineNodeView {...props} />;
  }

  // 2. Flow Control Strategy (Loops & Conditionals: ForEach, While, Branch)
  if (nodeData.kind === "FlowControl" || nodeData.category === "Flow Control") {
    return <FlowControlNodeView {...props} />;
  }

  // 3. Dynamic Tool Strategy (Tools with variable dynamic pins: MakeArray, MakeMap, FormatString, AppendString)
  if (
    rawRefId === "makearray" ||
    rawRefId === "makemap" ||
    rawRefId === "appendstring" ||
    rawRefId === "append" ||
    rawRefId === "formatstring"
  ) {
    return <DynamicToolNodeView {...props} />;
  }

  // 4. Standard Action/Tool Strategy (Custom scripts, Built-in tools, Plugins)
  return <ActionToolNodeView {...props} />;
}, (prev, next) => {
  if (prev.id !== next.id || prev.selected !== next.selected) return false;
  const pData = prev.data as any;
  const nData = next.data as any;
  if (pData === nData) return true;
  return (
    pData?.refId === nData?.refId &&
    pData?.kind === nData?.kind &&
    pData?.label === nData?.label &&
    pData?.executionStatus === nData?.executionStatus &&
    pData?.executionError === nData?.executionError &&
    pData?.inputs === nData?.inputs &&
    pData?.outputs === nData?.outputs &&
    pData?.configValues === nData?.configValues
  );
});

CustomPipelineNode.displayName = "CustomPipelineNode";
