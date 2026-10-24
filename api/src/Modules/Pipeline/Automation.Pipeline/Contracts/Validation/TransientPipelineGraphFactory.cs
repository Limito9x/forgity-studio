using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace Automation.Pipeline.Contracts.Validation;

public sealed record TransientPackagePipelineItem(
    PipelinePackageItemDto SourceDto,
    Domain.Entities.Pipeline Pipeline,
    NodeContractResolutionContext Context,
    IReadOnlyDictionary<Guid, string> NodeIdToTempIdMap,
    IReadOnlyDictionary<string, Guid> TempIdToNodeIdMap,
    bool HasNameConflict,
    string ResolvedName
);

public sealed record TransientPackageBuildResult(
    IReadOnlyList<TransientPackagePipelineItem> Items,
    IReadOnlyDictionary<string, Guid> BundleIdToPipelineIdMap
);

public interface ITransientPipelineGraphFactory
{
    Task<TransientPackageBuildResult> BuildFromPackageAsync(
        Guid targetProjectId,
        PipelinePackageDto package,
        string? namePrefix = null,
        CancellationToken ct = default
    );

    Domain.Entities.Pipeline BuildFromDraftSnapshot(
        Domain.Entities.Pipeline basePipeline,
        IReadOnlyList<SavePipelineNodeItem> nodes,
        IReadOnlyList<SavePipelineEdgeItem> edges,
        IReadOnlyList<PipelineParameter>? parameters = null
    );

    bool IsStructuralImportBlocker(
        PipelineDiagnostic diagnostic,
        IReadOnlyDictionary<Guid, PipelineNode> nodesById
    );
}

public class TransientPipelineGraphFactory(
    PipelineDbContext db
) : ITransientPipelineGraphFactory
{
    public async Task<TransientPackageBuildResult> BuildFromPackageAsync(
        Guid targetProjectId,
        PipelinePackageDto package,
        string? namePrefix = null,
        CancellationToken ct = default
    )
    {
        var pipelines = package.Pipelines ?? [];
        var orderedPipelines = pipelines.OrderBy(p => p.ImportOrder).ToList();

        // 1. Cấp ID mới cho từng BundleId (Leaf-first để SubPipeline con có ID trước Pipeline cha)
        var bundleIdToPipelineId = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in orderedPipelines)
        {
            bundleIdToPipelineId[p.BundleId] = IdGenerator.NewId();
        }

        // 2. Tra cứu tên các Pipeline hiện có trong targetProjectId để xử lý trùng tên
        var existingNames = await db.Pipelines
            .AsNoTracking()
            .Where(p => p.ProjectId == targetProjectId)
            .Select(p => p.Name)
            .ToListAsync(ct);

        var usedNames = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);

        // 3. Tra cứu Custom Definitions sẵn có trong Project đích
        var existingDefs = await db.NodeDefinitions
            .AsNoTracking()
            .Where(nd => nd.ProjectId == targetProjectId)
            .ToListAsync(ct);

        var customByKey = new Dictionary<string, NodeDefinition>(StringComparer.OrdinalIgnoreCase);
        var customById = new Dictionary<Guid, NodeDefinition>();

        foreach (var d in existingDefs)
        {
            customById[d.Id] = d;
            if (!string.IsNullOrWhiteSpace(d.Key))
            {
                customByKey[d.Key] = d;
            }
            if (!string.IsNullOrWhiteSpace(d.Name) && !customByKey.ContainsKey(d.Name))
            {
                customByKey[d.Name] = d;
            }
        }

        // Hợp nhất thêm các Custom Scripts có sẵn source code trong gói JSON
        if (package.Dependencies?.CustomScripts != null)
        {
            foreach (var script in package.Dependencies.CustomScripts)
            {
                if (string.IsNullOrWhiteSpace(script.Key) || string.IsNullOrWhiteSpace(script.ScriptContent))
                {
                    continue;
                }

                // Nếu chưa có trong DB đích, tạo NodeDefinition ảo in-memory
                if (!customByKey.ContainsKey(script.Key))
                {
                    var virtualDef = new NodeDefinition
                    {
                        Id = IdGenerator.NewId(),
                        ProjectId = targetProjectId,
                        Key = script.Key,
                        Name = string.IsNullOrWhiteSpace(script.Name) ? script.Key : script.Name.Trim(),
                        Label = string.IsNullOrWhiteSpace(script.Label) ? script.Key : script.Label.Trim(),
                        Executor = string.IsNullOrWhiteSpace(script.Executor) ? "blender" : script.Executor.Trim().ToLowerInvariant(),
                        ContentHash = script.ContentHash ?? string.Empty,
                        Inputs = script.Inputs?.ToList() ?? [],
                        Outputs = script.Outputs?.ToList() ?? [],
                        Status = NodeLifecycleStatus.Published
                    };

                    customByKey[script.Key] = virtualDef;
                    customById[virtualDef.Id] = virtualDef;
                }
            }
        }

        // Tra cứu SubPipelines sẵn có trong Project đích
        var projectPipelines = await db.Pipelines
            .AsNoTracking()
            .Where(p => p.ProjectId == targetProjectId)
            .ToDictionaryAsync(p => p.Id, ct);

        // 4. Dựng từng thực thể Pipeline tạm thời
        var resultItems = new List<TransientPackagePipelineItem>();

        foreach (var pItem in orderedPipelines)
        {
            var pipelineId = bundleIdToPipelineId[pItem.BundleId];

            var baseName = string.IsNullOrWhiteSpace(namePrefix)
                ? pItem.Name.Trim()
                : $"{namePrefix.Trim()} {pItem.Name.Trim()}".Trim();

            var candidateName = baseName;
            var hasConflict = usedNames.Contains(candidateName);
            var counter = 1;
            while (!usedNames.Add(candidateName))
            {
                candidateName = $"{baseName} (Imported{(counter > 1 ? $" {counter}" : "")})";
                counter++;
            }

            var pipeline = new Domain.Entities.Pipeline(
                targetProjectId,
                candidateName,
                pItem.TriggerType,
                pItem.TriggerConfig
            )
            {
                Id = pipelineId
            };

            // Copy Parameters
            if (pItem.Parameters != null && pItem.Parameters.Count > 0)
            {
                pipeline.Parameters = pItem.Parameters.Select(p => new PipelineParameter
                {
                    Id = Guid.NewGuid(),
                    Key = p.Key,
                    Label = p.Label,
                    Kind = p.Kind,
                    Type = p.Type,
                    Cardinality = p.Cardinality,
                    StructType = p.StructType,
                    IsRequired = p.IsRequired,
                    DefaultValue = p.DefaultValue,
                    Description = p.Description,
                    Order = p.Order,
                    ContextData = p.ContextData
                }).ToList();
            }

            // Remap Nodes
            var tempToRealNodeMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            var realToTempNodeMap = new Dictionary<Guid, string>();

            foreach (var n in pItem.Graph?.Nodes ?? [])
            {
                var newNodeId = IdGenerator.NewId();
                tempToRealNodeMap[n.TempId] = newNodeId;
                realToTempNodeMap[newNodeId] = n.TempId;

                var refId = n.RefId;
                var configValues = n.ConfigValues != null
                    ? new Dictionary<string, object?>(n.ConfigValues)
                    : new Dictionary<string, object?>();

                // Remap SubPipeline references
                if (n.Kind == PipelineNodeKind.SubPipeline)
                {
                    var targetBundleId = n.RefPipelineBundleId;
                    if (string.IsNullOrWhiteSpace(targetBundleId) &&
                        configValues.TryGetValue("pipelineBundleId", out var bVal))
                    {
                        targetBundleId = bVal?.ToString();
                    }

                    if (!string.IsNullOrWhiteSpace(targetBundleId) &&
                        bundleIdToPipelineId.TryGetValue(targetBundleId, out var realChildId))
                    {
                        refId = realChildId.ToString();
                        configValues["pipelineId"] = realChildId;
                    }
                }

                var nodeMetadata = n.Metadata != null
                    ? new Dictionary<string, object?>(n.Metadata)
                    : new Dictionary<string, object?>();

                if (n.Kind == PipelineNodeKind.Custom)
                {
                    refId = !string.IsNullOrWhiteSpace(n.CustomScriptKey)
                        ? n.CustomScriptKey
                        : n.RefId;

                    if (!customByKey.ContainsKey(refId))
                    {
                        nodeMetadata["unresolvedScript"] = true;
                    }
                }

                // Preserve unbound metadata for FilePins
                if (n.FilePins != null)
                {
                    foreach (var (k, pinMeta) in n.FilePins)
                    {
                        if (!configValues.ContainsKey(k) || configValues[k] == null ||
                            (configValues.TryGetValue(k, out var exV) && PipelineFileValue.TryGetUnbound(exV, out _)))
                        {
                            configValues[k] = new
                            {
                                status = "unbound",
                                originalFileName = pinMeta.OriginalFileName,
                                hashSha256 = pinMeta.HashSha256,
                                sizeBytes = pinMeta.SizeBytes,
                                contentType = pinMeta.ContentType
                            };
                        }
                    }
                }

                JsonDocument? configDoc = null;
                if (configValues.Count > 0)
                {
                    configDoc = JsonSerializer.SerializeToDocument(configValues);
                }

                JsonDocument? metadataDoc = null;
                if (nodeMetadata.Count > 0)
                {
                    metadataDoc = JsonSerializer.SerializeToDocument(nodeMetadata);
                }

                var nodeEntity = new PipelineNode(
                    id: newNodeId,
                    pipelineId: pipelineId,
                    refId: refId,
                    kind: n.Kind,
                    positionX: n.Position?.X ?? 0,
                    positionY: n.Position?.Y ?? 0,
                    config: configDoc,
                    parentId: null,
                    size: n.Size,
                    metadata: metadataDoc
                );

                pipeline.AddNode(nodeEntity);
            }

            // Remap ParentId for container nodes
            foreach (var n in pItem.Graph?.Nodes ?? [])
            {
                if (!string.IsNullOrWhiteSpace(n.ParentTempId) &&
                    tempToRealNodeMap.TryGetValue(n.ParentTempId, out var parentNodeId))
                {
                    var currentRealNodeId = tempToRealNodeMap[n.TempId];
                    var nodeEntity = pipeline.Nodes.FirstOrDefault(x => x.Id == currentRealNodeId);
                    if (nodeEntity != null)
                    {
                        nodeEntity.ParentId = parentNodeId;
                    }
                }
            }

            // Remap Edges
            foreach (var edge in pItem.Graph?.Edges ?? [])
            {
                if (tempToRealNodeMap.TryGetValue(edge.SourceNodeTempId, out var realSourceNodeId) &&
                    tempToRealNodeMap.TryGetValue(edge.TargetNodeTempId, out var realTargetNodeId))
                {
                    pipeline.AddEdge(
                        sourcePipelineNodeId: realSourceNodeId,
                        sourcePin: edge.SourcePin,
                        targetPipelineNodeId: realTargetNodeId,
                        targetPin: edge.TargetPin,
                        id: IdGenerator.NewId(),
                        kind: edge.Kind
                    );
                }
            }

            // Gộp thêm pipeline này vào context SubPipelinesById để các pipeline cha duyệt sau có thể tham chiếu
            projectPipelines[pipelineId] = pipeline;

            var context = new NodeContractResolutionContext(
                pipeline.Id,
                targetProjectId,
                pipeline.Parameters,
                customByKey,
                customById,
                projectPipelines
            );

            resultItems.Add(new TransientPackagePipelineItem(
                SourceDto: pItem,
                Pipeline: pipeline,
                Context: context,
                NodeIdToTempIdMap: realToTempNodeMap,
                TempIdToNodeIdMap: tempToRealNodeMap,
                HasNameConflict: hasConflict,
                ResolvedName: candidateName
            ));
        }

        return new TransientPackageBuildResult(resultItems, bundleIdToPipelineId);
    }

    public Domain.Entities.Pipeline BuildFromDraftSnapshot(
        Domain.Entities.Pipeline basePipeline,
        IReadOnlyList<SavePipelineNodeItem> nodes,
        IReadOnlyList<SavePipelineEdgeItem> edges,
        IReadOnlyList<PipelineParameter>? parameters = null
    )
    {
        var transientPipeline = new Domain.Entities.Pipeline(
            basePipeline.ProjectId,
            basePipeline.Name,
            basePipeline.TriggerType,
            basePipeline.TriggerConfig
        )
        {
            Id = basePipeline.Id,
            Parameters = parameters?.ToList() ?? basePipeline.Parameters.ToList()
        };

        var nodeMap = new Dictionary<Guid, Guid>();

        foreach (var nodeItem in nodes)
        {
            var targetId = nodeItem.Id.HasValue && nodeItem.Id.Value != Guid.Empty
                ? nodeItem.Id.Value
                : IdGenerator.NewId();

            nodeMap[targetId] = targetId;

            JsonDocument? configDoc = null;
            if (nodeItem.ConfigValues != null && nodeItem.ConfigValues.Count > 0)
            {
                configDoc = JsonSerializer.SerializeToDocument(nodeItem.ConfigValues);
            }

            JsonDocument? metadataDoc = null;
            if (nodeItem.Metadata != null && nodeItem.Metadata.Count > 0)
            {
                metadataDoc = JsonSerializer.SerializeToDocument(nodeItem.Metadata);
            }

            NodeSize? size = nodeItem.Width.HasValue && nodeItem.Height.HasValue
                ? new NodeSize(nodeItem.Width.Value, nodeItem.Height.Value)
                : null;

            var posX = nodeItem.Position != null ? nodeItem.Position.X : nodeItem.PositionX;
            var posY = nodeItem.Position != null ? nodeItem.Position.Y : nodeItem.PositionY;

            var nodeEntity = new PipelineNode(
                id: targetId,
                pipelineId: basePipeline.Id,
                refId: nodeItem.RefId,
                kind: nodeItem.Kind,
                positionX: posX,
                positionY: posY,
                config: configDoc,
                parentId: nodeItem.ParentId,
                size: size,
                metadata: metadataDoc
            );

            transientPipeline.AddNode(nodeEntity);
        }

        foreach (var edge in edges)
        {
            if (nodeMap.ContainsKey(edge.SourceNodeId) && nodeMap.ContainsKey(edge.TargetNodeId))
            {
                transientPipeline.AddEdge(
                    sourcePipelineNodeId: edge.SourceNodeId,
                    sourcePin: edge.SourcePin,
                    targetPipelineNodeId: edge.TargetNodeId,
                    targetPin: edge.TargetPin,
                    id: edge.Id.HasValue && edge.Id.Value != Guid.Empty ? edge.Id.Value : IdGenerator.NewId()
                );
            }
        }

        return transientPipeline;
    }

    public bool IsStructuralImportBlocker(
        PipelineDiagnostic diagnostic,
        IReadOnlyDictionary<Guid, PipelineNode> nodesById
    )
    {
        if (diagnostic.Severity != PipelineDiagnosticSeverity.Error)
        {
            return false;
        }

        return diagnostic.Code switch
        {
            PipelineDiagnosticCode.DagCycleDetected => true,
            PipelineDiagnosticCode.IncompatiblePinType => true,
            PipelineDiagnosticCode.DanglingEdgePin => true,
            PipelineDiagnosticCode.MissingNodeDefinition =>
                diagnostic.NodeId.HasValue &&
                nodesById.TryGetValue(diagnostic.NodeId.Value, out var node) &&
                node.Kind == PipelineNodeKind.Tool,
            _ => false
        };
    }
}
