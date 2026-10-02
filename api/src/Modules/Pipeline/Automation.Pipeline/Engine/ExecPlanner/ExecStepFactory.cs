using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Engine.ExecPlanner;

public static class ExecStepFactory
{
    public static Dictionary<Guid, ExecStep> BuildStepsLookup(
        Domain.Entities.Pipeline pipeline,
        IReadOnlyList<NodeDefinition> customDefinitions,
        IToolRegistry toolRegistry
    )
    {
        var customDefsLookup = customDefinitions
            .GroupBy(x => x.Id.ToString())
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var customDefsKeyLookup = customDefinitions
            .Where(x => !string.IsNullOrEmpty(x.Key))
            .GroupBy(x => x.Key)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var stepsLookup = new Dictionary<Guid, ExecStep>();

        foreach (var node in pipeline.Nodes)
        {
            if (node.Kind is PipelineNodeKind.Container or PipelineNodeKind.Capsule or PipelineNodeKind.Variable)
            {
                continue;
            }

            var isStart = node.Kind == PipelineNodeKind.Start ||
                          string.Equals(node.RefId, "Start", StringComparison.OrdinalIgnoreCase) ||
                          string.Equals(node.RefId, "BeginExecute", StringComparison.OrdinalIgnoreCase);

            var isFlowControl = node.Kind == PipelineNodeKind.FlowControl ||
                                (toolRegistry.Get(node.RefId) is { } t && string.Equals(t.Category, "Flow Control", StringComparison.OrdinalIgnoreCase));

            var tool = toolRegistry.Get(node.RefId);
            var isPure = tool is { IsPure: true };

            // Pure nodes are excluded from ExecPlan (resolved on-demand via pull)
            if (isPure && !isStart && !isFlowControl)
            {
                continue;
            }

            IReadOnlyList<PinDefinition> inputs = [];
            IReadOnlyList<PinDefinition> outputs = [];
            var label = node.RefId;
            var executor = "dotNet";

            if (isStart)
            {
                label = "Start";
                executor = "dotNet";
                outputs = pipeline.Parameters
                    .Where(p => p.Kind == Domain.Enums.PipelineParameterKind.Input)
                    .OrderBy(i => i.Order)
                    .Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        IsRequired = i.IsRequired,
                        DefaultValue = i.DefaultValue,
                        Metadata = i.StructType
                    }).ToList();
            }
            else if (tool != null)
            {
                inputs = tool.Inputs;
                outputs = tool.Outputs;
                label = !string.IsNullOrWhiteSpace(tool.Label) ? tool.Label : tool.Key;
                executor = "dotNet";
            }
            else
            {
                NodeDefinition? def = null;
                if (customDefsLookup.TryGetValue(node.RefId, out var foundDef) ||
                    customDefsKeyLookup.TryGetValue(node.RefId, out foundDef))
                {
                    def = foundDef;
                }

                if (def != null)
                {
                    inputs = def.Inputs;
                    outputs = def.Outputs;
                    label = !string.IsNullOrEmpty(def.Label) ? def.Label : def.Name;
                    executor = !string.IsNullOrEmpty(def.Executor) ? def.Executor : "blender";
                }
            }

            var incoming = pipeline.Edges
                .Where(e => e.TargetPipelineNodeId == node.Id)
                .Select(e => new IncomingPinConnection(e.TargetPin, e.SourcePipelineNodeId, e.SourcePin))
                .ToList();

            var isReturn = node.Kind == PipelineNodeKind.Return ||
                           string.Equals(node.RefId, "Return", StringComparison.OrdinalIgnoreCase);

            var isSubPipeline = node.Kind == PipelineNodeKind.SubPipeline;

            var nodeKind = isStart ? PipelineNodeKind.Start :
                           isReturn ? PipelineNodeKind.Return :
                           isSubPipeline ? PipelineNodeKind.SubPipeline :
                           isFlowControl ? PipelineNodeKind.FlowControl :
                           tool != null ? PipelineNodeKind.Tool :
                           node.Kind;

            stepsLookup[node.Id] = new ExecStep
            {
                NodeId = node.Id,
                StageId = node.ParentId,
                RefId = node.RefId,
                Kind = nodeKind,
                Label = label,
                Executor = executor,
                InputPins = inputs,
                OutputPins = outputs,
                IncomingConnections = incoming,
                Config = node.Config
            };
        }

        return stepsLookup;
    }
}
