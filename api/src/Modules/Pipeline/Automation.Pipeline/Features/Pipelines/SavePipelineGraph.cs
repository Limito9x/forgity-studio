using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Features.Pipelines.Services;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class SavePipelineGraphRequest
{
    public List<SavePipelineNodeItem> Nodes { get; set; } = [];
    public List<SavePipelineEdgeItem> Edges { get; set; } = [];
    public List<Automation.Pipeline.Domain.ValueObjects.PipelineParameter>? Parameters { get; set; }
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
        var cmd = new SavePipelineGraphCommand(
            pipelineId,
            req.Nodes,
            req.Edges,
            req.Parameters
        );
        var result = await bus.InvokeAsync<Result<PipelineGraphDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class SavePipelineGraphHandler(
    PipelineDbContext db,
    IPipelineGraphDtoBuilder graphDtoBuilder
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
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineGraphDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        // 0. Validate No Cycles for any SubPipeline nodes
        foreach (var nodeItem in command.Nodes.Where(n => n.Kind == PipelineNodeKind.SubPipeline))
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

        // 3. Sync Nodes
        var incomingNodeIds = command.Nodes
            .Where(n => n.Id.HasValue && n.Id.Value != Guid.Empty)
            .Select(n => n.Id!.Value)
            .ToHashSet();

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

        var nodeMap = new Dictionary<Guid, Guid>(); // Incoming Node ID -> Entity Node ID

        foreach (var nodeItem in command.Nodes)
        {
            JsonDocument? configDoc = null;
            if (nodeItem.ConfigValues != null && nodeItem.ConfigValues.Count > 0)
            {
                configDoc = JsonDocument.Parse(JsonSerializer.Serialize(nodeItem.ConfigValues));
            }

            JsonDocument? metadataDoc = null;
            if (nodeItem.Metadata != null && nodeItem.Metadata.Count > 0)
            {
                metadataDoc = JsonDocument.Parse(JsonSerializer.Serialize(nodeItem.Metadata));
            }

            NodeSize? size = nodeItem.Width.HasValue && nodeItem.Height.HasValue
                ? new NodeSize(nodeItem.Width.Value, nodeItem.Height.Value)
                : null;

            if (nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty)
            {
                var existing = pipeline.Nodes.FirstOrDefault(n => n.Id == nodeItem.Id.Value);
                if (existing != null)
                {
                    existing.Update(nodeItem.PositionX, nodeItem.PositionY, nodeItem.ParentId, size);
                    existing.UpdateConfig(configDoc);
                    existing.UpdateMetadata(metadataDoc);
                    nodeMap[nodeItem.Id.Value] = existing.Id;
                    continue;
                }
            }

            var targetId = nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty
                ? nodeItem.Id.Value
                : IdGenerator.NewId();

            var newNode = new PipelineNode(
                targetId,
                pipeline.Id,
                nodeItem.RefId,
                nodeItem.Kind,
                nodeItem.PositionX,
                nodeItem.PositionY,
                configDoc,
                nodeItem.ParentId,
                size,
                metadataDoc
            );

            nodeMap[targetId] = newNode.Id;
            if (nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty)
            {
                nodeMap[nodeItem.Id.Value] = newNode.Id;
            }

            db.PipelineNodes.Add(newNode);
            pipeline.AddNode(newNode);
        }

        // Validate that SetVariable nodes are not placed inside Worker stages
        foreach (var node in pipeline.Nodes.Where(n => string.Equals(n.RefId, "SetVariable", StringComparison.OrdinalIgnoreCase)))
        {
            if (node.ParentId.HasValue && node.ParentId.Value != Guid.Empty)
            {
                var parentContainer = pipeline.Nodes.FirstOrDefault(p => p.Id == node.ParentId.Value);
                if (parentContainer?.Metadata != null)
                {
                    try
                    {
                        var meta = JsonSerializer.Deserialize<Dictionary<string, object?>>(parentContainer.Metadata);
                        var executor = meta?.GetValueOrDefault("executor")?.ToString() ?? meta?.GetValueOrDefault("Executor")?.ToString();
                        if (string.Equals(executor, "Worker", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(executor, "blender", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(executor, "unreal", StringComparison.OrdinalIgnoreCase))
                        {
                            return Result.Fail<PipelineGraphDto>("Set Variable node cannot be placed inside a Worker stage. It must execute within a Server stage (e.g. Core Services).");
                        }
                    }
                    catch { }
                }
            }
        }

        // 4. Sync Edges (Diff matching by SourceNode, SourcePin, TargetNode, TargetPin)
        var incomingEdges = command.Edges.Select(e => new
        {
            e.Id,
            SourceId = nodeMap.GetValueOrDefault(e.SourceNodeId, e.SourceNodeId),
            e.SourcePin,
            TargetId = nodeMap.GetValueOrDefault(e.TargetNodeId, e.TargetNodeId),
            e.TargetPin
        }).ToList();

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
                var targetEdgeId = inc.Id.HasValue && inc.Id.Value != Guid.Empty
                    ? inc.Id.Value
                    : IdGenerator.NewId();

                var newEdge = new PipelineEdge(
                    pipeline.Id,
                    inc.SourceId,
                    inc.SourcePin,
                    inc.TargetId,
                    inc.TargetPin,
                    id: targetEdgeId
                );

                db.PipelineEdges.Add(newEdge);
                pipeline.AddEdge(newEdge);
            }
        }

        if (command.Parameters != null)
        {
            pipeline.Parameters = command.Parameters;
        }

        await db.SaveChangesAsync(ct);

        // 5. Build and return hydrated DTO via shared service
        var graphDto = await graphDtoBuilder.BuildDtoAsync(pipeline, ct);
        return Result.Ok(graphDto);
    }

    private static bool IsExecPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var norm = pin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
        return norm is "execin" or "execout" or "exec" or "loopbody" or "completed";
    }

    private static bool IsStartOrReturnNode(PipelineNode node)
    {
        return node.Kind == PipelineNodeKind.Start ||
               node.Kind == PipelineNodeKind.Return ||
               string.Equals(node.RefId, "Start", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(node.RefId, "Return", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(node.RefId, "BeginExecute", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(node.RefId, "EndExecute", StringComparison.OrdinalIgnoreCase);
    }
}
