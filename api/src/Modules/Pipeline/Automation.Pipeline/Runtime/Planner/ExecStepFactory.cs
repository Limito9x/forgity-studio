using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Contracts.Tools;
namespace Automation.Pipeline.Runtime.Planner;

public static class ExecStepFactory
{
    public static Dictionary<Guid, ExecStep> BuildStepsLookup(
        Domain.Entities.Pipeline pipeline,
        IReadOnlyList<NodeDefinition> customDefinitions,
        IToolRegistry toolRegistry,
        INodeContractResolver? contractResolver = null,
        NodeContractResolutionContext? resolutionContext = null,
        IReadOnlyDictionary<Guid, ResolvedNodeContract>? resolvedContracts = null
    )
    {
        // 1. Phân giải thống nhất qua INodeContractResolver nếu có
        IReadOnlyDictionary<Guid, ResolvedNodeContract>? contracts = resolvedContracts;
        if (contracts == null && contractResolver != null && resolutionContext != null)
        {
            contracts = contractResolver.ResolveAllNodes(pipeline.Nodes, resolutionContext);
        }

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

            ResolvedNodeContract? contract = null;
            contracts?.TryGetValue(node.Id, out contract);

            var isStart = (contract != null && contract.Kind == PipelineNodeKind.Start) ||
                          node.Kind == PipelineNodeKind.Start ||
                          string.Equals(node.RefId, "Start", StringComparison.OrdinalIgnoreCase) ||
                          string.Equals(node.RefId, "BeginExecute", StringComparison.OrdinalIgnoreCase);

            var isPure = contract?.IsPure ?? (toolRegistry.Get(node.RefId) is { IsPure: true });

            // Pure nodes are excluded from ExecPlan (resolved on-demand via pull)
            if (isPure && !isStart)
            {
                continue;
            }

            IReadOnlyList<PinDefinition> inputs = [];
            IReadOnlyList<PinDefinition> outputs = [];
            var label = node.RefId;
            var executor = "dotNet";
            var nodeKind = contract?.Kind ?? node.Kind;

            if (contract != null)
            {
                inputs = contract.Inputs;
                outputs = contract.Outputs;
                label = contract.Label;
                executor = contract.Executor == "builtin" ? "dotNet" : contract.Executor;
                nodeKind = contract.Kind;
            }
            else if (isStart)
            {
                label = "Start";
                executor = "dotNet";
                nodeKind = PipelineNodeKind.Start;
                outputs = pipeline.Parameters
                    .Where(p => p.Kind == PipelineParameterKind.Input)
                    .OrderBy(i => i.Order)
                    .Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        StructType = i.StructType,
                        IsRequired = i.IsRequired,
                        DefaultValue = i.DefaultValue
                    }).ToList();
            }
            else if (toolRegistry.Get(node.RefId) is { } tool)
            {
                inputs = tool.Inputs;
                outputs = tool.Outputs;
                label = !string.IsNullOrWhiteSpace(tool.Label) ? tool.Label : tool.Key;
                executor = "dotNet";
                nodeKind = PipelineNodeKind.Tool;
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
                    nodeKind = PipelineNodeKind.Custom;
                }
            }

            var incoming = pipeline.Edges
                .Where(e => e.TargetPipelineNodeId == node.Id)
                .Select(e => new IncomingPinConnection(e.TargetPin, e.SourcePipelineNodeId, e.SourcePin))
                .ToList();

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
