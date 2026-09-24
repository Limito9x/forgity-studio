using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Features.Pipelines;

public class SavePipelineGraphRequest
{
    public List<SavePipelineNodeItem> Nodes { get; set; } = [];
    public List<SavePipelineEdgeItem> Edges { get; set; } = [];
}

public class SavePipelineGraphEndpoint(IMessageBus bus) : Endpoint<SavePipelineGraphRequest, PipelineGraphDto>
{
    public override void Configure()
    {
        Put("{id:guid}/graph");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineGraphDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(SavePipelineGraphRequest req, CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var cmd = new SavePipelineGraphCommand(pipelineId, req.Nodes, req.Edges);
        var result = await bus.InvokeAsync<Result<PipelineGraphDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class SavePipelineGraphHandler(
    PipelineDbContext db,
    IToolRegistry toolRegistry
)
{
    public async Task<Result<PipelineGraphDto>> HandleAsync(
        SavePipelineGraphCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .Include(x => x.Nodes)
            .Include(x => x.Edges)
            .Include(x => x.Inputs)
            .Include(x => x.Outputs)
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineGraphDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        // 0. Validate No Cycles for any SubPipeline nodes
        foreach (var nodeItem in command.Nodes.Where(n => string.Equals(n.Kind, PipelineNodeKind.SubPipeline, StringComparison.OrdinalIgnoreCase)))
        {
            Guid? targetId = null;
            if (Guid.TryParse(nodeItem.RefId, out var parsedRefId))
            {
                targetId = parsedRefId;
            }
            else if (nodeItem.ConfigValues != null && nodeItem.ConfigValues.TryGetValue("pipelineId", out var pVal) && Guid.TryParse(pVal?.ToString(), out var pGuid))
            {
                targetId = pGuid;
            }

            if (targetId.HasValue && targetId.Value != Guid.Empty)
            {
                var cycleResult = await Engine.Validators.PipelineCycleValidator.ValidateNoCycleAsync(
                    db,
                    command.PipelineId,
                    targetId.Value,
                    ct
                );

                if (cycleResult.IsFailed)
                {
                    return Result.Fail<PipelineGraphDto>(cycleResult.Errors);
                }
            }
        }

        // 1. Sync Nodes
        var incomingNodeIds = command.Nodes
            .Where(n => n.Id.HasValue && n.Id.Value != Guid.Empty)
            .Select(n => n.Id!.Value)
            .ToHashSet();

        // Remove deleted nodes and their associated edges first
        var nodesToRemove = pipeline.Nodes
            .Where(n => !incomingNodeIds.Contains(n.Id))
            .ToList();

        foreach (var node in nodesToRemove)
        {
            var edgesForNode = pipeline.Edges
                .Where(e => e.SourcePipelineNodeId == node.Id || e.TargetPipelineNodeId == node.Id)
                .ToList();

            foreach (var edge in edgesForNode)
            {
                db.PipelineEdges.Remove(edge);
                pipeline.RemoveEdge(edge.Id);
            }

            db.PipelineNodes.Remove(node);
            pipeline.RemoveNode(node.Id);
        }

        // Map existing/new nodes
        var nodeMap = new Dictionary<Guid, Guid>(); // Old/incoming ID -> Entity ID

        foreach (var nodeItem in command.Nodes)
        {
            JsonDocument? configDoc = null;
            if (nodeItem.ConfigValues != null && nodeItem.ConfigValues.Count > 0)
            {
                configDoc = JsonDocument.Parse(JsonSerializer.Serialize(nodeItem.ConfigValues));
            }

            if (nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty)
            {
                var existing = pipeline.Nodes.FirstOrDefault(n => n.Id == nodeItem.Id.Value);
                if (existing != null)
                {
                    existing.Update(nodeItem.PositionX, nodeItem.PositionY);
                    existing.UpdateConfig(configDoc);
                    nodeMap[nodeItem.Id.Value] = existing.Id;
                    continue;
                }
            }

            // Create new node with client ID or new ID
            var targetId = nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty
                ? nodeItem.Id.Value
                : Guid.NewGuid();

            var newNode = new PipelineNode(
                targetId,
                pipeline.Id,
                nodeItem.RefId,
                nodeItem.Kind,
                nodeItem.PositionX,
                nodeItem.PositionY,
                configDoc
            );

            nodeMap[targetId] = newNode.Id;
            if (nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty)
            {
                nodeMap[nodeItem.Id.Value] = newNode.Id;
            }

            pipeline.AddNode(newNode);
        }

        // 2. Sync Edges (Diff matching by SourceNode, SourcePin, TargetNode, TargetPin)
        var incomingEdges = command.Edges.Select(e => new
        {
            SourceId = nodeMap.GetValueOrDefault(e.SourceNodeId, e.SourceNodeId),
            e.SourcePin,
            TargetId = nodeMap.GetValueOrDefault(e.TargetNodeId, e.TargetNodeId),
            e.TargetPin
        }).ToList();

        // Remove obsolete edges
        var edgesToRemove = pipeline.Edges.Where(existing =>
            !incomingEdges.Any(inc =>
                inc.SourceId == existing.SourcePipelineNodeId &&
                inc.SourcePin == existing.SourcePin &&
                inc.TargetId == existing.TargetPipelineNodeId &&
                inc.TargetPin == existing.TargetPin
            )
        ).ToList();

        foreach (var edge in edgesToRemove)
        {
            db.PipelineEdges.Remove(edge);
            pipeline.RemoveEdge(edge.Id);
        }

        // Add new edges that don't already exist
        foreach (var inc in incomingEdges)
        {
            var alreadyExists = pipeline.Edges.Any(existing =>
                existing.SourcePipelineNodeId == inc.SourceId &&
                existing.SourcePin == inc.SourcePin &&
                existing.TargetPipelineNodeId == inc.TargetId &&
                existing.TargetPin == inc.TargetPin
            );

            if (!alreadyExists)
            {
                pipeline.AddEdge(inc.SourceId, inc.SourcePin, inc.TargetId, inc.TargetPin);
            }
        }

        await db.SaveChangesAsync(ct);

        // 3. Build return DTO directly (avoids nested Wolverine invocation & disposed context issues)
        var customDefs = await db.NodeDefinitions
            .AsNoTracking()
            .Where(x => x.ProjectId == pipeline.ProjectId)
            .ToListAsync(ct);

        var nodeDtos = new List<PipelineNodeGraphDto>();

        foreach (var node in pipeline.Nodes)
        {
            var isTool = string.Equals(node.Kind, PipelineNodeKind.Tool, StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(node.Kind, "Tool", StringComparison.OrdinalIgnoreCase);

            IReadOnlyList<PinDefinition> inputs = [];
            IReadOnlyList<PinDefinition> outputs = [];
            string label = node.RefId;
            string? category = null;
            string? executor = null;

            if (isTool)
            {
                var tool = toolRegistry.Get(node.RefId);
                if (tool != null)
                {
                    inputs = tool.Inputs;
                    outputs = tool.Outputs;
                    label = tool.Label;
                    category = "BuiltIn";
                    executor = "dotNet";
                }
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
                    inputs = def.Inputs;
                    outputs = def.Outputs;
                    label = def.Label;
                    category = "Custom";
                    executor = def.Executor;
                }
            }

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
            variableDtos
        );

        return Result.Ok(graphDto);
    }
}
