import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { nodeView, views } from "./views";
import { useNodeDefinition } from "@/features/pipelines/hooks/useNodeDefinition";
import { usePipelineFormScope } from "@/features/pipelines/components/canvas/PipelineFormContext";
import { useNodePinResolver } from "./hooks/useNodePinResolver";
import type { CustomPipelineNodeData } from "./types";
import { StartPipelineNodeView } from "./StartPipelineNodeView";
import { ReturnNodeView } from "./ReturnNodeView";
import { FlowControlNodeView } from "./FlowControlNodeView";
import { StandardToolNodeView } from "./StandardToolNodeView";

export const PipelineNodeRouter = memo((props: NodeProps) => {
  const data = props.data as CustomPipelineNodeData;
  const { projectId } = usePipelineFormScope();
  const definition = useNodeDefinition(data.kind, data.refId);

  useNodePinResolver({
    nodeId: props.id,
    refId: data.refId,
    projectId,
    configValues: data.configValues,
    schemaConfigKeys: definition?.capabilities?.schemaConfigKeys,
    hasDynamicPins: data.kind === "Tool" && ((definition as any)?.hasDynamicPins ?? definition?.isDynamic) === true,
  });

  const view = nodeView(data.kind, definition);
  if (view === "Start") return <StartPipelineNodeView {...props} />;
  if (view === "Return") return <ReturnNodeView {...props} />;
  if (view === "FlowControl") return <FlowControlNodeView {...props} />;
  if (view === "Missing") return <StandardToolNodeView {...props} missingDefinition />;
  const View = views[view] ?? StandardToolNodeView;
  return <View {...props} />;
});
PipelineNodeRouter.displayName = "PipelineNodeRouter";
