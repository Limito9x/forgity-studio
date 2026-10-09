using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Features.Pipelines.Services;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines;

public class SavePipelineGraphRequest
{
    public List<SavePipelineNodeItem> Nodes { get; set; } = [];
    public List<SavePipelineEdgeItem> Edges { get; set; } = [];
    public List<Automation.Pipeline.Domain.ValueObjects.PipelineParameter>? Parameters { get; set; }
}

public class SavePipelineGraphEndpoint(IMessageBus bus)
    : Endpoint<SavePipelineGraphRequest, PipelineGraphDto>
{
    public override void Configure()
    {
        Put("{id:guid}/graph");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d.Produces<PipelineGraphDto>(200).Produces(400).Produces(404));
    }

    public override async Task HandleAsync(SavePipelineGraphRequest req, CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var cmd = new SavePipelineGraphCommand(pipelineId, req.Nodes, req.Edges, req.Parameters);
        var result = await bus.InvokeAsync<Result<PipelineGraphDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class SavePipelineGraphHandler(
    PipelineDbContext db,
    IPipelineGraphDtoBuilder graphDtoBuilder,
    IAssetApi assetApi,
    ILogger<SavePipelineGraphHandler> logger
)
{
    public async Task<Result<PipelineGraphDto>> HandleAsync(
        SavePipelineGraphCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db
            .Pipelines.Include(x => x.Nodes)
            .Include(x => x.Edges)
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineGraphDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        var oldConfigs = pipeline.Nodes.ToDictionary(x => x.Id, x => x.Config);
        var createdLinks = new List<AssetLinkReference>();

        try
        {
            // 0. Validate No Cycles for any SubPipeline nodes
            foreach (
                var nodeItem in command.Nodes.Where(n => n.Kind == PipelineNodeKind.SubPipeline)
            )
            {
                Guid? targetId = null;
                if (Guid.TryParse(nodeItem.RefId, out var parsedRefId))
                {
                    targetId = parsedRefId;
                }
                else if (
                    nodeItem.ConfigValues != null
                    && nodeItem.ConfigValues.TryGetValue("pipelineId", out var pVal)
                    && Guid.TryParse(pVal?.ToString(), out var pGuid)
                )
                {
                    targetId = pGuid;
                }

                if (targetId.HasValue && targetId.Value != Guid.Empty)
                {
                    var cycleResult =
                        await Engine.Validators.PipelineCycleValidator.ValidateNoCycleAsync(
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

            // 1. Sync Nodes - Remove deleted nodes and their edges
            var incomingNodeIds = command
                .Nodes.Where(n => n.Id.HasValue && n.Id.Value != Guid.Empty)
                .Select(n => n.Id!.Value)
                .ToHashSet();

            var nodesToRemove = pipeline.Nodes.Where(n => !incomingNodeIds.Contains(n.Id)).ToList();

            foreach (var node in nodesToRemove)
            {
                var edgesForNode = pipeline
                    .Edges.Where(e =>
                        e.SourcePipelineNodeId == node.Id || e.TargetPipelineNodeId == node.Id
                    )
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

            // 2. Process and Upsert Nodes
            foreach (var nodeItem in command.Nodes)
            {
                var targetId =
                    nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty
                        ? nodeItem.Id.Value
                        : IdGenerator.NewId();

                if (nodeItem.ConfigValues != null && nodeItem.ConfigValues.Count > 0)
                {
                    foreach (var (key, value) in nodeItem.ConfigValues.ToList())
                    {
                        if (PipelineFileValue.TryGetDraft(value, out var assetId, out var origName))
                        {
                            var owner = PipelineFileValue.Owner(targetId, key);
                            var linkResult = await assetApi.CreateLinkAsync(
                                new(assetId, origName!),
                                owner,
                                ct: ct
                            );
                            if (linkResult.IsFailed)
                            {
                                await CompensateCreatedLinksAsync(createdLinks);
                                db.ChangeTracker.Clear();
                                return Result.Fail<PipelineGraphDto>(linkResult.Errors);
                            }
                            createdLinks.Add(new(linkResult.Value.AssetLinkId, owner));
                            nodeItem.ConfigValues[key] = new PipelineFileParameter(
                                linkResult.Value.AssetLinkId
                            );
                        }
                        else if (PipelineFileValue.TryGetLinkId(value, out var linkId))
                        {
                            var owner = PipelineFileValue.Owner(targetId, key);
                            var verified = await assetApi.GetLinksByIdsAsync(
                                [new(linkId, owner)],
                                ct
                            );
                            if (verified.IsFailed)
                            {
                                await CompensateCreatedLinksAsync(createdLinks);
                                db.ChangeTracker.Clear();
                                return Result.Fail<PipelineGraphDto>(verified.Errors);
                            }
                            nodeItem.ConfigValues[key] = new PipelineFileParameter(linkId);
                        }
                    }
                }

                JsonDocument? configDoc = null;
                if (nodeItem.ConfigValues != null && nodeItem.ConfigValues.Count > 0)
                {
                    configDoc = JsonSerializer.SerializeToDocument(
                        nodeItem.ConfigValues,
                        new JsonSerializerOptions(JsonSerializerDefaults.Web)
                    );
                }

                // Clean up replaced or cleared file pins for this node
                var oldConfig = oldConfigs.GetValueOrDefault(targetId);
                if (oldConfig != null)
                {
                    var retainedLinkIds = PipelineFileValue
                        .References(targetId, configDoc)
                        .Select(x => x.AssetLinkId)
                        .ToHashSet();
                    var oldReferences = PipelineFileValue.References(targetId, oldConfig);
                    foreach (var oldRef in oldReferences)
                    {
                        if (!retainedLinkIds.Contains(oldRef.AssetLinkId))
                        {
                            await assetApi.RemoveLinkByIdAsync(oldRef, ct);
                        }
                    }
                }

                JsonDocument? metadataDoc = null;
                if (nodeItem.Metadata != null && nodeItem.Metadata.Count > 0)
                {
                    metadataDoc = JsonSerializer.SerializeToDocument(
                        nodeItem.Metadata,
                        new JsonSerializerOptions(JsonSerializerDefaults.Web)
                    );
                }

                NodeSize? size =
                    nodeItem.Width.HasValue && nodeItem.Height.HasValue
                        ? new NodeSize(nodeItem.Width.Value, nodeItem.Height.Value)
                        : null;

                if (nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty)
                {
                    var existing = pipeline.Nodes.FirstOrDefault(n => n.Id == nodeItem.Id.Value);
                    if (existing != null)
                    {
                        existing.Update(
                            nodeItem.PositionX,
                            nodeItem.PositionY,
                            nodeItem.ParentId,
                            size
                        );
                        existing.UpdateConfig(configDoc);
                        existing.UpdateMetadata(metadataDoc);
                        nodeMap[nodeItem.Id.Value] = existing.Id;
                        continue;
                    }
                }

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
                if (!pipeline.Nodes.Any(x => x.Id == newNode.Id))
                    pipeline.AddNode(newNode);
            }

            // Validate that SetVariable nodes are not placed inside Worker stages
            foreach (
                var node in pipeline.Nodes.Where(n =>
                    string.Equals(n.RefId, "SetVariable", StringComparison.OrdinalIgnoreCase)
                )
            )
            {
                if (node.ParentId.HasValue && node.ParentId.Value != Guid.Empty)
                {
                    var parentContainer = pipeline.Nodes.FirstOrDefault(p =>
                        p.Id == node.ParentId.Value
                    );
                    if (parentContainer?.Metadata != null)
                    {
                        try
                        {
                            var meta = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                                parentContainer.Metadata
                            );
                            var executor =
                                meta?.GetValueOrDefault("executor")?.ToString()
                                ?? meta?.GetValueOrDefault("Executor")?.ToString();
                            if (
                                string.Equals(
                                    executor,
                                    "Worker",
                                    StringComparison.OrdinalIgnoreCase
                                )
                                || string.Equals(
                                    executor,
                                    "blender",
                                    StringComparison.OrdinalIgnoreCase
                                )
                                || string.Equals(
                                    executor,
                                    "unreal",
                                    StringComparison.OrdinalIgnoreCase
                                )
                            )
                            {
                                await CompensateCreatedLinksAsync(createdLinks);
                                db.ChangeTracker.Clear();
                                return Result.Fail<PipelineGraphDto>(
                                    "Set Variable node cannot be placed inside a Worker stage. It must execute within a Server stage (e.g. Core Services)."
                                );
                            }
                        }
                        catch { }
                    }
                }
            }

            // 3. Sync Edges (Diff matching by SourceNode, SourcePin, TargetNode, TargetPin)
            var incomingEdges = command
                .Edges.Select(e => new
                {
                    e.Id,
                    SourceId = nodeMap.GetValueOrDefault(e.SourceNodeId, e.SourceNodeId),
                    e.SourcePin,
                    TargetId = nodeMap.GetValueOrDefault(e.TargetNodeId, e.TargetNodeId),
                    e.TargetPin,
                })
                .ToList();

            var edgesToRemove = pipeline
                .Edges.Where(existing =>
                    !incomingEdges.Any(inc =>
                        inc.SourceId == existing.SourcePipelineNodeId
                        && inc.SourcePin == existing.SourcePin
                        && inc.TargetId == existing.TargetPipelineNodeId
                        && inc.TargetPin == existing.TargetPin
                    )
                )
                .ToList();

            foreach (var edge in edgesToRemove)
            {
                db.PipelineEdges.Remove(edge);
                pipeline.RemoveEdge(edge.Id);
            }

            foreach (var inc in incomingEdges)
            {
                var alreadyExists = pipeline.Edges.Any(existing =>
                    existing.SourcePipelineNodeId == inc.SourceId
                    && existing.SourcePin == inc.SourcePin
                    && existing.TargetPipelineNodeId == inc.TargetId
                    && existing.TargetPin == inc.TargetPin
                );

                if (!alreadyExists)
                {
                    var targetEdgeId =
                        inc.Id.HasValue && inc.Id.Value != Guid.Empty
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
                    if (!pipeline.Edges.Any(x => x.Id == newEdge.Id))
                        pipeline.AddEdge(newEdge);
                }
            }

            if (command.Parameters != null)
            {
                pipeline.Parameters = command.Parameters;
            }

            await db.SaveChangesAsync(ct);

            // 4. Build and return hydrated DTO via shared service (Single invocation)
            var graphDto = await graphDtoBuilder.BuildDtoAsync(pipeline, ct);
            return Result.Ok(graphDto);
        }
        catch (Exception)
        {
            await CompensateCreatedLinksAsync(createdLinks);
            throw;
        }
    }

    private async Task CompensateCreatedLinksAsync(List<AssetLinkReference> links)
    {
        foreach (var link in links)
        {
            try
            {
                var result = await assetApi.RemoveLinkByIdAsync(link, CancellationToken.None);
                if (result.IsFailed)
                {
                    logger.LogError(
                        "Failed to compensate new file link {LinkId}: {Errors}",
                        link.AssetLinkId,
                        result.Errors
                    );
                }
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "Failed to compensate new file link {LinkId}",
                    link.AssetLinkId
                );
            }
        }
    }
}
