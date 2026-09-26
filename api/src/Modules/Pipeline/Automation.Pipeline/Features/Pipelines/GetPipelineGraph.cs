using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Features.Pipelines;

public record GetPipelineGraphQuery(Guid PipelineId);

public class GetPipelineGraphEndpoint(IMessageBus bus) : EndpointWithoutRequest<PipelineGraphDto>
{
    public override void Configure()
    {
        Get("{id:guid}/graph");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);
        Description(d => d
            .Produces<PipelineGraphDto>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var query = new GetPipelineGraphQuery(pipelineId);
        var result = await bus.InvokeAsync<Result<PipelineGraphDto>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPipelineGraphHandler(
    PipelineDbContext db,
    IToolRegistry toolRegistry,
    IEntityStructRegistry structRegistry
)
{
    public async Task<Result<PipelineGraphDto>> HandleAsync(
        GetPipelineGraphQuery query,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .AsNoTracking()
            .Include(x => x.Nodes)
            .Include(x => x.Edges)
            .Include(x => x.Inputs)
            .Include(x => x.Outputs)
            .FirstOrDefaultAsync(x => x.Id == query.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineGraphDto>($"Pipeline '{query.PipelineId}' not found.");
        }

        var customDefs = await db.NodeDefinitions
            .AsNoTracking()
            .Where(x => x.ProjectId == pipeline.ProjectId)
            .ToListAsync(ct);

        var projectPipelines = await db.Pipelines
            .AsNoTracking()
            .Include(p => p.Inputs)
            .Include(p => p.Outputs)
            .Where(p => p.ProjectId == pipeline.ProjectId)
            .ToListAsync(ct);

        var nodeDtos = new List<PipelineNodeGraphDto>();

        foreach (var node in pipeline.Nodes)
        {
            var isStartNode = string.Equals(node.Kind, PipelineNodeKind.Start, StringComparison.OrdinalIgnoreCase) ||
                              string.Equals(node.RefId, "Start", StringComparison.OrdinalIgnoreCase) ||
                              string.Equals(node.RefId, "BeginExecute", StringComparison.OrdinalIgnoreCase);

            var isReturnNode = string.Equals(node.Kind, PipelineNodeKind.Return, StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(node.RefId, "Return", StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(node.RefId, "EndExecute", StringComparison.OrdinalIgnoreCase);

            var isSubPipeline = string.Equals(node.Kind, PipelineNodeKind.SubPipeline, StringComparison.OrdinalIgnoreCase);

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
                        Id = "Resource",
                        Label = "Resource",
                        Kind = PinKind.Data,
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        Cardinality = PinCardinality.Single,
                        Metadata = "Resource"
                    });
                    startOutputs.Add(new PinDefinition
                    {
                        Id = "Workspace",
                        Label = "Workspace",
                        Kind = PinKind.Data,
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        Cardinality = PinCardinality.Single,
                        Metadata = "Workspace"
                    });
                }

                startOutputs.AddRange(pipeline.Inputs.OrderBy(i => i.Order).Select(i => new PinDefinition
                {
                    Id = i.Key,
                    Label = i.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = i.Type,
                    Cardinality = i.Cardinality,
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
                var returnInputs = pipeline.Outputs.OrderBy(i => i.Order).Select(i => new PinDefinition
                {
                    Id = i.Key,
                    Label = i.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = i.Type,
                    Cardinality = i.Cardinality,
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

                    var subInputs = targetPipeline.Inputs.OrderBy(i => i.Order).Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        IsRequired = i.IsRequired,
                        DefaultValue = i.DefaultValue
                    }).ToList();

                    var subOutputs = targetPipeline.Outputs.OrderBy(i => i.Order).Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality
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
            // 1. Check in ToolRegistry first (for all BuiltIn tools)
            else if (toolRegistry.Get(node.RefId) is { } tool)
            {
                var ctx = new PinResolutionContext(structRegistry, pipeline.ProjectId, pipeline.Variables);
                var (pInputs, pOutputs) = FlowPinHelper.WithExecPinsResolved(tool, configValues, ctx);
                inputs = pInputs;
                outputs = pOutputs;
                label = !string.IsNullOrWhiteSpace(tool.Label) ? tool.Label : tool.Key;
                category = tool.Category ?? "Tools";
                executor = "builtin";
            }
            else
            {
                // 2. Check in Project NodeDefinitions
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
                configValues
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

        var inputDtos = pipeline.Inputs.OrderBy(i => i.Order).Select(i => new PipelineInputDto(
            i.Id,
            i.Key,
            i.Label,
            i.Type,
            i.Cardinality,
            i.IsRequired,
            i.DefaultValue,
            i.Order
        )).ToList();

        var outputDtos = pipeline.Outputs.OrderBy(i => i.Order).Select(i => new PipelineOutputDto(
            i.Id,
            i.Key,
            i.Label,
            i.Type,
            i.Cardinality,
            i.Order
        )).ToList();

        var variableDtos = (pipeline.Variables ?? new()).Select(v => new PipelineVariableDto(
            v.Name,
            v.Type,
            v.Cardinality,
            v.Description,
            v.StructType
        )).ToList();

        var graphDto = new PipelineGraphDto(
            pipeline.Id,
            pipeline.ProjectId,
            pipeline.Name,
            pipeline.TriggerType,
            pipeline.TriggerWorkspaceId,
            nodeDtos,
            edgeDtos,
            inputDtos,
            outputDtos,
            variableDtos,
            pipeline.TriggerConfig
        );

        return Result.Ok(graphDto);
    }
}
