using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Contracts.Tools;
using Microsoft.EntityFrameworkCore;
namespace Automation.Pipeline.Contracts.NodeContract;

public class PipelineNodeContractResolver(
    PipelineDbContext? db,
    IToolRegistry toolRegistry,
    IEntityStructRegistry structRegistry
) : INodeContractResolver
{
    public PipelineNodeContractResolver(
        IToolRegistry toolRegistry,
        IEntityStructRegistry? structRegistry = null
    ) : this(null, toolRegistry, structRegistry ?? new EntityStructRegistry([]))
    {
    }

    public async Task<NodeContractResolutionContext> BuildContextAsync(
        Domain.Entities.Pipeline pipeline,
        CancellationToken ct = default
    )
    {
        if (db == null)
        {
            throw new InvalidOperationException("PipelineDbContext is required to query custom node and subpipeline definitions from database.");
        }

        var customDefs = await db.NodeDefinitions
            .AsNoTracking()
            .Where(x => x.ProjectId == pipeline.ProjectId)
            .ToListAsync(ct);

        var customByKey = new Dictionary<string, NodeDefinition>(StringComparer.OrdinalIgnoreCase);
        var customById = new Dictionary<Guid, NodeDefinition>();

        foreach (var def in customDefs)
        {
            customById[def.Id] = def;
            if (!string.IsNullOrWhiteSpace(def.Key))
            {
                customByKey[def.Key] = def;
            }
            if (!string.IsNullOrWhiteSpace(def.Name) && !customByKey.ContainsKey(def.Name))
            {
                customByKey[def.Name] = def;
            }
        }

        var projectPipelines = await db.Pipelines
            .AsNoTracking()
            .Where(p => p.ProjectId == pipeline.ProjectId)
            .ToDictionaryAsync(p => p.Id, ct);

        return new NodeContractResolutionContext(
            pipeline.Id,
            pipeline.ProjectId,
            pipeline.Parameters,
            customByKey,
            customById,
            projectPipelines
        );
    }

    public IReadOnlyDictionary<Guid, ResolvedNodeContract> ResolveAllNodes(
        IReadOnlyCollection<PipelineNode> nodes,
        NodeContractResolutionContext context
    )
    {
        var result = new Dictionary<Guid, ResolvedNodeContract>();
        foreach (var node in nodes)
        {
            result[node.Id] = ResolveNode(node, context);
        }
        return result;
    }

    public ResolvedNodeContract ResolveNode(
        PipelineNode node,
        NodeContractResolutionContext context
    )
    {
        Dictionary<string, object?>? configValues = null;
        if (node.Config != null)
        {
            try
            {
                configValues = JsonSerializer.Deserialize<Dictionary<string, object?>>(node.Config);
            }
            catch { }
        }

        Dictionary<string, object?>? metadata = null;
        if (node.Metadata != null)
        {
            try
            {
                metadata = JsonSerializer.Deserialize<Dictionary<string, object?>>(node.Metadata);
            }
            catch { }
        }

        var isStartNode = node.Kind == PipelineNodeKind.Start ||
                          string.Equals(node.RefId, "Start", StringComparison.OrdinalIgnoreCase) ||
                          string.Equals(node.RefId, "BeginExecute", StringComparison.OrdinalIgnoreCase);

        var isReturnNode = node.Kind == PipelineNodeKind.Return ||
                           string.Equals(node.RefId, "Return", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(node.RefId, "EndExecute", StringComparison.OrdinalIgnoreCase);

        var isSubPipeline = node.Kind == PipelineNodeKind.SubPipeline;

        // Custom label override support
        var customLabel = metadata?.GetValueOrDefault("label")?.ToString();

        // 1. START NODE
        if (isStartNode)
        {
            var defLabel = "Start";
            var startOutputs = new List<PinDefinition>();

            startOutputs.AddRange(context.Parameters
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
                }));

            var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.Start, isPure: false, [], startOutputs);

            return new ResolvedNodeContract(
                NodeId: node.Id,
                RefId: node.RefId,
                Kind: PipelineNodeKind.Start,
                Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : defLabel,
                DefinitionLabel: defLabel,
                Category: "System",
                Executor: "builtin",
                IsPure: false,
                IsFlowControl: false,
                SubPipelineId: null,
                NodeDefinitionId: null,
                Inputs: pInputs,
                Outputs: pOutputs,
                ConfigValues: configValues,
                Metadata: metadata,
                HasDynamicPins: false,
                IsVolatile: false
            );
        }

        // 2. RETURN NODE
        if (isReturnNode)
        {
            var defLabel = "Return";
            var returnInputs = context.Parameters
                .Where(p => p.Kind == PipelineParameterKind.Output)
                .OrderBy(i => i.Order)
                .Select(i => new PinDefinition
                {
                    Id = i.Key,
                    Label = i.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = i.Type,
                    Cardinality = i.Cardinality,
                    StructType = i.StructType,
                    IsRequired = false,
                    DefaultValue = null
                }).ToList();

            var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.Return, isPure: false, returnInputs, []);

            return new ResolvedNodeContract(
                NodeId: node.Id,
                RefId: node.RefId,
                Kind: PipelineNodeKind.Return,
                Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : defLabel,
                DefinitionLabel: defLabel,
                Category: "System",
                Executor: "builtin",
                IsPure: false,
                IsFlowControl: false,
                SubPipelineId: null,
                NodeDefinitionId: null,
                Inputs: pInputs,
                Outputs: pOutputs,
                ConfigValues: configValues,
                Metadata: metadata,
                HasDynamicPins: false,
                IsVolatile: false
            );
        }

        // 3. SUBPIPELINE NODE
        if (isSubPipeline)
        {
            Guid? targetPipelineId = null;
            if (Guid.TryParse(node.RefId, out var parsedRefId))
            {
                targetPipelineId = parsedRefId;
            }
            else if (configValues != null && configValues.TryGetValue("pipelineId", out var pVal) && Guid.TryParse(pVal?.ToString(), out var pGuid))
            {
                targetPipelineId = pGuid;
            }

            if (targetPipelineId.HasValue && context.SubPipelinesById.TryGetValue(targetPipelineId.Value, out var targetPipeline))
            {
                var defLabel = targetPipeline.Name;
                var subInputs = targetPipeline.Parameters
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

                var subOutputs = targetPipeline.Parameters
                    .Where(p => p.Kind == PipelineParameterKind.Output)
                    .OrderBy(i => i.Order)
                    .Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        StructType = i.StructType
                    }).ToList();

                var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.SubPipeline, isPure: false, subInputs, subOutputs);

                return new ResolvedNodeContract(
                    NodeId: node.Id,
                    RefId: node.RefId,
                    Kind: PipelineNodeKind.SubPipeline,
                    Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : defLabel,
                    DefinitionLabel: defLabel,
                    Category: "Pipelines",
                    Executor: "builtin",
                    IsPure: false,
                    IsFlowControl: false,
                    SubPipelineId: targetPipelineId,
                    NodeDefinitionId: null,
                    Inputs: pInputs,
                    Outputs: pOutputs,
                    ConfigValues: configValues,
                    Metadata: metadata
                );
            }

            var missingLabel = "Sub-Pipeline (Missing)";
            var (mInputs, mOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.SubPipeline, isPure: false, [], []);
            return new ResolvedNodeContract(
                NodeId: node.Id,
                RefId: node.RefId,
                Kind: PipelineNodeKind.SubPipeline,
                Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : missingLabel,
                DefinitionLabel: missingLabel,
                Category: "Pipelines",
                Executor: "builtin",
                IsPure: false,
                IsFlowControl: false,
                SubPipelineId: targetPipelineId,
                NodeDefinitionId: null,
                Inputs: mInputs,
                Outputs: mOutputs,
                ConfigValues: configValues,
                Metadata: metadata,
                HasDynamicPins: false,
                IsVolatile: false,
                IsDefinitionMissing: true,
                MissingReason: $"Referenced SubPipeline '{targetPipelineId}' could not be found."
            );
        }

        // 4. TOOL NODE (C# Registry)
        if (toolRegistry.Get(node.RefId) is { } tool)
        {
            var defLabel = !string.IsNullOrWhiteSpace(tool.Label) ? tool.Label : tool.Key;
            var ctx = new PinResolutionContext(structRegistry, context.ProjectId, context.Parameters);
            var (pInputs, pOutputs) = FlowPinHelper.WithExecPinsResolved(tool, configValues, ctx);

            var isFlowControl = string.Equals(tool.Category, "Flow Control", StringComparison.OrdinalIgnoreCase);
            var toolCaps = tool.Capabilities ?? (tool.HasDynamicPins ? new NodeCapabilities(ViewVariant: "Standard") : null);

            return new ResolvedNodeContract(
                NodeId: node.Id,
                RefId: node.RefId,
                Kind: isFlowControl ? PipelineNodeKind.FlowControl : PipelineNodeKind.Tool,
                Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : defLabel,
                DefinitionLabel: defLabel,
                Category: tool.Category ?? "Tools",
                Executor: "builtin",
                IsPure: tool.IsPure,
                IsFlowControl: isFlowControl,
                SubPipelineId: null,
                NodeDefinitionId: null,
                Inputs: pInputs,
                Outputs: pOutputs,
                ConfigValues: configValues,
                Metadata: metadata,
                Capabilities: toolCaps,
                HasDynamicPins: tool.HasDynamicPins,
                IsVolatile: tool.IsVolatile
            );
        }

        // 5. CUSTOM NODE (Python/Blender/Unreal NodeDefinition)
        NodeDefinition? def = null;
        if (Guid.TryParse(node.RefId, out var defGuid) && context.CustomDefinitionsById.TryGetValue(defGuid, out var foundById))
        {
            def = foundById;
        }
        else if (context.CustomDefinitionsByKey.TryGetValue(node.RefId, out var foundByKey))
        {
            def = foundByKey;
        }

        if (def != null)
        {
            var defLabel = !string.IsNullOrWhiteSpace(def.Label) ? def.Label : def.Name;
            var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(def);

            return new ResolvedNodeContract(
                NodeId: node.Id,
                RefId: node.RefId,
                Kind: PipelineNodeKind.Custom,
                Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : defLabel,
                DefinitionLabel: defLabel,
                Category: "Custom",
                Executor: def.Executor,
                IsPure: false,
                IsFlowControl: false,
                SubPipelineId: null,
                NodeDefinitionId: def.Id,
                Inputs: pInputs,
                Outputs: pOutputs,
                ConfigValues: configValues,
                Metadata: metadata,
                Capabilities: null,
                HasDynamicPins: false,
                IsVolatile: false
            );
        }

        // 6. STAGE CONTAINER
        if (node.Kind == PipelineNodeKind.Container ||
            string.Equals(node.RefId, "ScopeContainer", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(node.RefId, "Container", StringComparison.OrdinalIgnoreCase))
        {
            var metaName = metadata?.GetValueOrDefault("name")?.ToString();
            var defLabel = !string.IsNullOrWhiteSpace(metaName) ? metaName : "Stage Container";
            var executor = metadata?.GetValueOrDefault("executorKey")?.ToString()
                           ?? metadata?.GetValueOrDefault("executor")?.ToString()
                           ?? "dotNet";

            var containerInputs = new List<PinDefinition>
            {
                new()
                {
                    Id = "runner",
                    Label = "Target Runner",
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.EntityRef,
                    StructType = WellKnownStructTypes.Runner,
                    IsRequired = false
                }
            };

            return new ResolvedNodeContract(
                NodeId: node.Id,
                RefId: node.RefId,
                Kind: PipelineNodeKind.Container,
                Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : defLabel,
                DefinitionLabel: defLabel,
                Category: "Container",
                Executor: executor,
                IsPure: false,
                IsFlowControl: false,
                SubPipelineId: null,
                NodeDefinitionId: null,
                Inputs: containerInputs,
                Outputs: [],
                ConfigValues: configValues,
                Metadata: metadata,
                HasDynamicPins: false,
                IsVolatile: false
            );
        }

        // 7. CAPSULE / VARIABLE
        if (node.Kind is PipelineNodeKind.Capsule or PipelineNodeKind.Variable ||
            string.Equals(node.RefId, "Capsule", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(node.RefId, "GetVariable", StringComparison.OrdinalIgnoreCase))
        {
            var varKey = configValues?.GetValueOrDefault("VariableName")?.ToString()
                         ?? configValues?.GetValueOrDefault("key")?.ToString()
                         ?? node.RefId;
            var category = metadata?.GetValueOrDefault("category")?.ToString() ?? "Variable";

            PinDefinition outputPin;
            var param = context.Parameters.FirstOrDefault(p =>
                string.Equals(p.Key, varKey, StringComparison.OrdinalIgnoreCase));
            if (param != null)
            {
                outputPin = new PinDefinition
                {
                    Id = param.Key,
                    Label = param.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = param.Type,
                    Cardinality = param.Cardinality,
                    StructType = param.StructType,
                    IsRequired = false,
                    DefaultValue = param.DefaultValue
                };
            }
            else
            {
                outputPin = new PinDefinition
                {
                    Id = varKey,
                    Label = varKey,
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.String,
                    IsRequired = false
                };
            }

            return new ResolvedNodeContract(
                NodeId: node.Id,
                RefId: node.RefId,
                Kind: node.Kind == PipelineNodeKind.Variable ? PipelineNodeKind.Variable : PipelineNodeKind.Capsule,
                Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : (param?.Label ?? varKey),
                DefinitionLabel: varKey,
                Category: category,
                Executor: "builtin",
                IsPure: true,
                IsFlowControl: false,
                SubPipelineId: null,
                NodeDefinitionId: null,
                Inputs: [],
                Outputs: [outputPin],
                ConfigValues: configValues,
                Metadata: metadata,
                HasDynamicPins: false,
                IsVolatile: true
            );
        }

        // 8. UNKNOWN / MISSING DEFINITION FALLBACK
        var unknownLabel = !string.IsNullOrWhiteSpace(node.RefId) ? node.RefId : "Unknown Node";
        var (fInputs, fOutputs) = FlowPinHelper.WithExecPins(node.Kind, isPure: false, [], []);

        return new ResolvedNodeContract(
            NodeId: node.Id,
            RefId: node.RefId,
            Kind: node.Kind,
            Label: !string.IsNullOrWhiteSpace(customLabel) ? customLabel : unknownLabel,
            DefinitionLabel: unknownLabel,
            Category: "Unknown",
            Executor: "builtin",
            IsPure: false,
            IsFlowControl: false,
            SubPipelineId: null,
            NodeDefinitionId: null,
            Inputs: fInputs,
            Outputs: fOutputs,
            ConfigValues: configValues,
            Metadata: metadata,
            IsDefinitionMissing: true,
            MissingReason: $"Node '{node.RefId}' of kind '{node.Kind}' does not match any registered Tool or Custom Node Definition."
        );
    }
}
