import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./nodes/types";
import { StartPipelineNodeView } from "./nodes/StartPipelineNodeView";
import { ReturnNodeView } from "./nodes/views/ReturnNodeView";
import { StructNodeView } from "./nodes/views/StructNodeView";
import { FlowControlNodeView } from "./nodes/FlowControlNodeView";
import { DynamicToolNodeView } from "./nodes/DynamicToolNodeView";
import { ActionToolNodeView } from "./nodes/ActionToolNodeView";

// Re-export all types and visual helpers for backward compatibility across the canvas
export * from "./nodes/types";

/**
 * CustomPipelineNode: Strategy Dispatcher cho các loại Action/Step Node trên Canvas.
 * Phân giải ngữ cảnh node để điều phối (dispatch) tới Strategy Component chuyên biệt tương ứng.
 */
export const CustomPipelineNode = memo((props: NodeProps) => {
  const nodeData = props.data as unknown as CustomPipelineNodeData;
  const rawKind = (nodeData.kind || "").toLowerCase();
  const rawRefId = (nodeData.refId || "").toLowerCase();
  const viewVariant = (nodeData.capabilities?.viewVariant || "").toLowerCase();

  // 1. Start Node Strategy (Pipeline Entry point)
  if (rawKind === "start" || rawRefId === "start" || rawRefId === "beginexecute") {
    return <StartPipelineNodeView {...props} />;
  }

  // 2. Return Node Strategy (Pipeline Exit point)
  if (rawKind === "return" || rawRefId === "return" || rawRefId === "endexecute") {
    return <ReturnNodeView {...props} />;
  }

  // 3. Struct Strategy (BreakStruct & MakeStruct)
  if (viewVariant === "struct" || rawRefId === "breakstruct" || rawRefId === "makestruct") {
    return <StructNodeView {...props} />;
  }

  // 4. Flow Control Strategy (Loops & Conditionals: ForEach, While, Branch)
  if (nodeData.kind === "FlowControl" || nodeData.category === "Flow Control") {
    return <FlowControlNodeView {...props} />;
  }

  // 5. Dynamic Tool Strategy (Collections: MakeArray, AppendString, FormatString)
  if (
    viewVariant === "collection" ||
    nodeData.isDynamic ||
    rawRefId === "makearray" ||
    rawRefId === "appendstring" ||
    rawRefId === "formatstring"
  ) {
    return <DynamicToolNodeView {...props} />;
  }

  // 6. Standard Action/Tool Strategy (Custom scripts, Built-in tools, Plugins)
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
    pData?.configValues === nData?.configValues &&
    pData?.capabilities === nData?.capabilities
  );
});

CustomPipelineNode.displayName = "CustomPipelineNode";
