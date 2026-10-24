import { nodeView } from "../../../nodeDefinitions";
import { memo, type ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import type { CustomPipelineNodeData } from "./types";
import { useNodeDefinition } from "../NodeDefinitions";
import { usePipelineFormScope } from "../../../form-scope/PipelineFormScope";
import { useNodePinResolver } from "./hooks/useNodePinResolver";
import { StartPipelineNodeView } from "./StartPipelineNodeView";
import { ReturnNodeView } from "./views/ReturnNodeView";
import { StructNodeView } from "./views/StructNodeView";
import { FlowControlNodeView } from "./FlowControlNodeView";
import { CollectionNodeView } from "./CollectionNodeView";
import { StandardToolNodeView } from "./StandardToolNodeView";

const views: Record<string, ComponentType<NodeProps>> = {
  Standard: StandardToolNodeView,
  Collection: CollectionNodeView,
  Struct: StructNodeView,
};

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
    hasDynamicPins: data.kind === "Tool" && definition?.hasDynamicPins === true,
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
