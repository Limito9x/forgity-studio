using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Features.Pipelines.Services;

public interface IPipelineGraphDtoBuilder
{
    Task<PipelineGraphDto> BuildDtoAsync(Domain.Entities.Pipeline pipeline, CancellationToken ct = default);
}

public class PipelineGraphDtoBuilder(
    PipelineDbContext db,
    IToolRegistry toolRegistry,
    IEntityStructRegistry structRegistry
) : IPipelineGraphDtoBuilder
{
    public async Task<PipelineGraphDto> BuildDtoAsync(
        Domain.Entities.Pipeline pipeline,
        CancellationToken ct = default
    )
    {
        var customDefs = await db.NodeDefinitions
            .AsNoTracking()
            .Where(x => x.ProjectId == pipeline.ProjectId)
            .ToListAsync(ct);

        var projectPipelines = await db.Pipelines
            .AsNoTracking()
            .Where(p => p.ProjectId == pipeline.ProjectId)
            .ToListAsync(ct);

        var nodeDtos = new List<PipelineNodeGraphDto>();

        foreach (var node in pipeline.Nodes)
        {
            var isStartNode = node.Kind == PipelineNodeKind.Start ||
                              string.Equals(node.RefId, "Start", StringComparison.OrdinalIgnoreCase) ||
                              string.Equals(node.RefId, "BeginExecute", StringComparison.OrdinalIgnoreCase);

            var isReturnNode = node.Kind == PipelineNodeKind.Return ||
                               string.Equals(node.RefId, "Return", StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(node.RefId, "EndExecute", StringComparison.OrdinalIgnoreCase);

            var isSubPipeline = node.Kind == PipelineNodeKind.SubPipeline;

            IReadOnlyList<PinDefinition> inputs = [];
            IReadOnlyList<PinDefinition> outputs = [];
            string label = node.RefId;
            string? category = null;
            string? executor = null;

            Dictionary<string, object?>? configValues = null;
            if (node.Config != null)
            {
                try
                {
                    configValues = JsonSerializer.Deserialize<Dictionary<string, object?>>(node.Config);
                }
                catch
                {
                    // Fallback to empty if not a dictionary
                }
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

            if (isStartNode)
            {
                label = pipeline.TriggerType switch
                {
                    PipelineTriggerType.OnResourceCreated => "On Resource Created",
                    PipelineTriggerType.OnResourceVersionUpdated => "On Resource Version Updated",
                    _ => "Start"
                };
                category = "System";
                executor = "builtin";
                var startOutputs = new List<PinDefinition>();

                if (pipeline.TriggerType is PipelineTriggerType.OnResourceCreated or PipelineTriggerType.OnResourceVersionUpdated)
                {
                    startOutputs.Add(new PinDefinition
                    {
                        Id = "Resources",
                        Label = "Resources",
                        Kind = PinKind.Data,
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        Cardinality = PinCardinality.Array,
                        Metadata = "Resource"
                    });
                    startOutputs.Add(new PinDefinition
                    {
                        Id = "Repository",
                        Label = "Repository",
                        Kind = PinKind.Data,
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        Cardinality = PinCardinality.Single,
                        Metadata = "Repository"
                    });
                    startOutputs.Add(new PinDefinition
                    {
                        Id = "Runner",
                        Label = "Runner",
                        Kind = PinKind.Data,
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        Cardinality = PinCardinality.Single,
                        Metadata = "Runner"
                    });
                }

                startOutputs.AddRange(pipeline.Parameters
                    .Where(p => p.Kind == PipelineParameterKind.Input)
                    .OrderBy(i => i.Order)
                    .Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        Metadata = i.StructType,
                        IsRequired = i.IsRequired,
                        DefaultValue = i.DefaultValue
                    }));

                var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.Start, isPure: false, [], startOutputs);
                inputs = pInputs;
                outputs = pOutputs;
            }
            else if (isReturnNode)
            {
                label = "Return";
                category = "System";
                executor = "builtin";
                var returnInputs = pipeline.Parameters
                    .Where(p => p.Kind == PipelineParameterKind.Output)
                    .OrderBy(i => i.Order)
                    .Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        Metadata = i.StructType,
                        IsRequired = false,
                        DefaultValue = null
                    }).ToList();
                var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.Return, isPure: false, returnInputs, []);
                inputs = pInputs;
                outputs = pOutputs;
            }
            else if (isSubPipeline)
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

                var targetPipeline = projectPipelines.FirstOrDefault(p => p.Id == targetPipelineId);
                if (targetPipeline != null)
                {
                    label = targetPipeline.Name;
                    category = "Pipelines";
                    executor = "builtin";

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
                            Metadata = i.StructType,
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
                            Metadata = i.StructType
                        }).ToList();

                    var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.SubPipeline, isPure: false, subInputs, subOutputs);
                    inputs = pInputs;
                    outputs = pOutputs;
                }
                else
                {
                    label = "Sub-Pipeline (Missing)";
                    category = "Pipelines";
                    executor = "builtin";
                    var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(PipelineNodeKind.SubPipeline, isPure: false, [], []);
                    inputs = pInputs;
                    outputs = pOutputs;
                }
            }
            else if (toolRegistry.Get(node.RefId) is { } tool)
            {
                var ctx = new PinResolutionContext(structRegistry, pipeline.ProjectId, pipeline.Parameters);
                var (pInputs, pOutputs) = FlowPinHelper.WithExecPinsResolved(tool, configValues, ctx);
                inputs = pInputs;
                outputs = pOutputs;
                label = !string.IsNullOrWhiteSpace(tool.Label) ? tool.Label : tool.Key;
                category = tool.Category ?? "Tools";
                executor = "builtin";
            }
            else
            {
                var def = customDefs.FirstOrDefault(x =>
                    string.Equals(x.Key, node.RefId, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(x.Id.ToString(), node.RefId, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(x.Name, node.RefId, StringComparison.OrdinalIgnoreCase)
                );

                if (def != null)
                {
                    var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(def);
                    inputs = pInputs;
                    outputs = pOutputs;
                    label = !string.IsNullOrWhiteSpace(def.Label) ? def.Label : def.Name;
                    category = "Custom";
                    executor = def.Executor;
                }
                else if (node.Kind == PipelineNodeKind.Container ||
                         string.Equals(node.RefId, "ScopeContainer", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(node.RefId, "Container", StringComparison.OrdinalIgnoreCase))
                {
                    var metaName = metadata?.GetValueOrDefault("name")?.ToString();
                    label = !string.IsNullOrWhiteSpace(metaName) ? metaName : "Stage Container";
                    category = "Container";
                    executor = metadata?.GetValueOrDefault("executorKey")?.ToString();
                    inputs = [];
                    outputs = [];
                }
                else if (node.Kind == PipelineNodeKind.Capsule ||
                         string.Equals(node.RefId, "Capsule", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(node.RefId, "GetVariable", StringComparison.OrdinalIgnoreCase))
                {
                    var varKey = configValues?.GetValueOrDefault("VariableName")?.ToString() 
                                 ?? configValues?.GetValueOrDefault("key")?.ToString() 
                                 ?? node.RefId;
                    label = varKey;
                    category = metadata?.GetValueOrDefault("category")?.ToString() ?? "Variable";
                    executor = "builtin";
                    inputs = [];
                    outputs = [];
                }
                else
                {
                    var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(node.Kind, isPure: false, [], []);
                    inputs = pInputs;
                    outputs = pOutputs;
                }
            }

            nodeDtos.Add(new PipelineNodeGraphDto(
                node.Id,
                node.RefId,
                node.Kind,
                label,
                category,
                executor,
                node.Position,
                inputs,
                outputs,
                configValues,
                node.ParentId,
                node.Size,
                metadata
            ));
        }

        var edgeDtos = pipeline.Edges.Select(e => new PipelineEdgeGraphDto(
            e.Id,
            e.SourcePipelineNodeId,
            e.SourcePin,
            e.TargetPipelineNodeId,
            e.TargetPin,
            e.Kind
        )).ToList();

        var parameterDtos = (pipeline.Parameters ?? []).OrderBy(p => p.Order).Select(p => new PipelineParameterDto(
            p.Id,
            p.Key,
            p.Label,
            p.Kind,
            p.Type,
            p.Cardinality,
            p.StructType,
            p.IsRequired,
            p.DefaultValue,
            p.Description,
            p.Order,
            p.ContextData
        )).ToList();

        return new PipelineGraphDto(
            pipeline.Id,
            pipeline.ProjectId,
            pipeline.Name,
            pipeline.TriggerType,
            nodeDtos,
            edgeDtos,
            parameterDtos,
            pipeline.TriggerConfig
        );
    }
}
