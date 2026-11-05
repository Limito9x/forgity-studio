using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.BuildTime.Graph;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.BuildTime.Features.Authoring;

public class SavePipelineGraphRequest
{
    public List<SavePipelineNodeItem> Nodes { get; set; } = [];
    public List<SavePipelineEdgeItem> Edges { get; set; } = [];
    public List<PipelineParameter>? Parameters { get; set; }
    public bool CreateSnapshot { get; set; } = false;
    public string? SnapshotSummary { get; set; }
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
        var cmd = new SavePipelineGraphCommand(
            pipelineId,
            req.Nodes,
            req.Edges,
            req.Parameters,
            req.CreateSnapshot,
            req.SnapshotSummary
        );
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
    private static readonly JsonSerializerOptions JsonWebOptions = new(JsonSerializerDefaults.Web);

    public async Task<Result<PipelineGraphDto>> HandleAsync(
        SavePipelineGraphCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineGraphDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        var createdLinks = new List<AssetLinkReference>();

        try
        {
            // 0. Validate No Cycles for any SubPipeline nodes
            foreach (var nodeItem in command.Nodes.Where(n => n.Kind == PipelineNodeKind.SubPipeline))
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
                    var cycleResult = await PipelineCycleValidator.ValidateNoCycleAsync(
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

            // 1. Phân tích thu hồi File Pins đã bị xóa khỏi Canvas bằng Batch API
            var incomingNodeIds = command.Nodes
                .Where(n => n.Id.HasValue && n.Id.Value != Guid.Empty)
                .Select(n => n.Id!.Value)
                .ToHashSet();

            var linksToRemove = new List<AssetLinkReference>();
            var oldNodesMap = pipeline.GraphData.Nodes.ToDictionary(n => n.Id);

            // Nodes bị xóa hoàn toàn
            foreach (var (oldNodeId, oldNode) in oldNodesMap)
            {
                if (!incomingNodeIds.Contains(oldNodeId) && oldNode.Config != null)
                {
                    linksToRemove.AddRange(PipelineFileValue.References(oldNodeId, oldNode.Config));
                }
            }

            var nodeMap = new Dictionary<Guid, Guid>(); // Client Temp ID -> Real ID
            var processedNodes = new List<PipelineNode>();

            // 2. Process and Upsert Nodes
            foreach (var nodeItem in command.Nodes)
            {
                var targetId = nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty
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
                            nodeItem.ConfigValues[key] = new PipelineFileParameter(linkResult.Value.AssetLinkId);
                        }
                        else if (PipelineFileValue.TryGetLinkId(value, out var linkId))
                        {
                            var owner = PipelineFileValue.Owner(targetId, key);
                            var resolved = await assetApi.ResolveOrCloneLinkAsync(linkId, owner, ct);
                            if (resolved.IsFailed)
                            {
                                await CompensateCreatedLinksAsync(createdLinks);
                                db.ChangeTracker.Clear();
                                return Result.Fail<PipelineGraphDto>(resolved.Errors);
                            }
                            if (resolved.Value.AssetLinkId != linkId)
                            {
                                createdLinks.Add(new(resolved.Value.AssetLinkId, owner));
                            }
                            nodeItem.ConfigValues[key] = new PipelineFileParameter(resolved.Value.AssetLinkId);
                        }
                    }
                }

                JsonDocument? configDoc = null;
                if (nodeItem.ConfigValues != null && nodeItem.ConfigValues.Count > 0)
                {
                    configDoc = JsonSerializer.SerializeToDocument(nodeItem.ConfigValues, JsonWebOptions);
                }

                // Kiểm tra pins file cũ của node này có bị xóa/thay thế không
                if (oldNodesMap.TryGetValue(targetId, out var existingOldNode) && existingOldNode.Config != null)
                {
                    var retainedLinkIds = PipelineFileValue.References(targetId, configDoc)
                        .Select(x => x.AssetLinkId)
                        .ToHashSet();

                    var oldReferences = PipelineFileValue.References(targetId, existingOldNode.Config);
                    foreach (var oldRef in oldReferences)
                    {
                        if (!retainedLinkIds.Contains(oldRef.AssetLinkId))
                        {
                            linksToRemove.Add(oldRef);
                        }
                    }
                }

                JsonDocument? metadataDoc = null;
                if (nodeItem.Metadata != null && nodeItem.Metadata.Count > 0)
                {
                    metadataDoc = JsonSerializer.SerializeToDocument(nodeItem.Metadata, JsonWebOptions);
                }

                var posX = nodeItem.Position != null ? nodeItem.Position.X : nodeItem.PositionX;
                var posY = nodeItem.Position != null ? nodeItem.Position.Y : nodeItem.PositionY;

                var node = new PipelineNode(
                    targetId,
                    pipeline.Id,
                    nodeItem.RefId,
                    nodeItem.Kind,
                    posX,
                    posY,
                    configDoc,
                    nodeItem.ParentId,
                    nodeItem.Width.HasValue && nodeItem.Height.HasValue ? new NodeSize(nodeItem.Width.Value, nodeItem.Height.Value) : null,
                    metadataDoc
                );

                processedNodes.Add(node);
                nodeMap[targetId] = node.Id;
                if (nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty)
                {
                    nodeMap[nodeItem.Id.Value] = node.Id;
                }
            }

            // Gọi Batch API thu hồi links không còn dùng một lần duy nhất
            if (linksToRemove.Count > 0)
            {
                await assetApi.RemoveLinksByIdsAsync(linksToRemove, ct);
            }

            // Validate that SetVariable nodes are not placed inside Worker stages
            foreach (var node in processedNodes.Where(n => string.Equals(n.RefId, "SetVariable", StringComparison.OrdinalIgnoreCase)))
            {
                if (node.ParentId.HasValue && node.ParentId.Value != Guid.Empty)
                {
                    var parentContainer = processedNodes.FirstOrDefault(p => p.Id == node.ParentId.Value);
                    if (parentContainer?.Metadata != null)
                    {
                        try
                        {
                            var meta = JsonSerializer.Deserialize<Dictionary<string, object?>>(parentContainer.Metadata);
                            var executor = meta?.GetValueOrDefault("executor")?.ToString() ?? meta?.GetValueOrDefault("Executor")?.ToString();
                            if (string.Equals(executor, "Worker", StringComparison.OrdinalIgnoreCase)
                                || string.Equals(executor, "blender", StringComparison.OrdinalIgnoreCase)
                                || string.Equals(executor, "unreal", StringComparison.OrdinalIgnoreCase))
                            {
                                await CompensateCreatedLinksAsync(createdLinks);
                                db.ChangeTracker.Clear();
                                return Result.Fail<PipelineGraphDto>("Set Variable node cannot be placed inside a Worker stage. It must execute within a Server stage (e.g. Core Services).");
                            }
                        }
                        catch { }
                    }
                }
            }

            // 3. Process Edges
            var processedEdges = new List<PipelineEdge>();
            foreach (var inc in command.Edges)
            {
                var sourceId = nodeMap.GetValueOrDefault(inc.SourceNodeId, inc.SourceNodeId);
                var targetId = nodeMap.GetValueOrDefault(inc.TargetNodeId, inc.TargetNodeId);
                var targetEdgeId = inc.Id.HasValue && inc.Id.Value != Guid.Empty ? inc.Id.Value : IdGenerator.NewId();

                var edge = new PipelineEdge(
                    pipeline.Id,
                    sourceId,
                    inc.SourcePin,
                    targetId,
                    inc.TargetPin,
                    id: targetEdgeId
                );
                processedEdges.Add(edge);
            }

            // 4. Update Pipeline GraphData (JSONB Unified Document)
            pipeline.GraphData = new PipelineGraphDocument
            {
                Parameters = command.Parameters ?? pipeline.GraphData.Parameters,
                Nodes = processedNodes,
                Edges = processedEdges
            };

            // 5. Compute SHA-256 GraphHash
            var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(pipeline.GraphData);
            pipeline.GraphHash = Convert.ToHexString(SHA256.HashData(jsonBytes)).ToLowerInvariant();

            // 6. Handle Snapshot Checkpoint if requested
            if (command.CreateSnapshot)
            {
                var maxVersion = await db.PipelineSnapshots
                    .Where(s => s.PipelineId == pipeline.Id)
                    .MaxAsync(s => (int?)s.VersionNumber, ct) ?? 0;

                var snapshot = new PipelineSnapshot(
                    pipeline.Id,
                    maxVersion + 1,
                    pipeline.GraphData,
                    pipeline.GraphHash,
                    PipelineSnapshotSource.ManualCheckpoint,
                    command.SnapshotSummary
                );

                db.PipelineSnapshots.Add(snapshot);
                pipeline.ActiveSnapshotId = snapshot.Id;

                // Inline Rolling Prune: Giữ tối đa 50 bản gần nhất không gắn với Execution
                var totalSnapshots = await db.PipelineSnapshots.CountAsync(s => s.PipelineId == pipeline.Id, ct);
                if (totalSnapshots > 50)
                {
                    var pinnedSnapshotIds = await db.PipelineExecutions
                        .Where(e => e.PipelineId == pipeline.Id && e.SnapshotId != null)
                        .Select(e => e.SnapshotId!.Value)
                        .Distinct()
                        .ToListAsync(ct);

                    var pruneCandidates = await db.PipelineSnapshots
                        .Where(s => s.PipelineId == pipeline.Id && !pinnedSnapshotIds.Contains(s.Id) && s.Id != snapshot.Id)
                        .OrderBy(s => s.VersionNumber)
                        .Take(totalSnapshots - 50)
                        .ToListAsync(ct);

                    if (pruneCandidates.Count > 0)
                    {
                        db.PipelineSnapshots.RemoveRange(pruneCandidates);
                    }
                }
            }

            await db.SaveChangesAsync(ct);

            // 7. Return hydrated DTO
            var graphDto = await graphDtoBuilder.BuildDtoAsync(pipeline, ct);
            db.ChangeTracker.Clear();
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
        if (links.Count == 0) return;
        try
        {
            await assetApi.RemoveLinksByIdsAsync(links, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to compensate {Count} newly created file links", links.Count);
        }
    }
}
