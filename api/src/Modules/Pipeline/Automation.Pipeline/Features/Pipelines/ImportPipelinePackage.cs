using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class ImportPipelinePackageEndpoint(IMessageBus bus) : Endpoint<ImportPipelinePackageRequest, ImportPipelinePackageResponseDto>
{
    public override void Configure()
    {
        Post("import");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Create);
        Description(d => d
            .Produces<ImportPipelinePackageResponseDto>(200)
            .Produces(400));
    }

    public override async Task HandleAsync(ImportPipelinePackageRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ImportPipelinePackageResponseDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class ImportPipelinePackageHandler(
    PipelineDbContext db,
    IAssetApi assetApi,
    IHttpClientFactory httpClientFactory,
    ILogger<ImportPipelinePackageHandler> logger
)
{
    public async Task<Result<ImportPipelinePackageResponseDto>> HandleAsync(
        ImportPipelinePackageRequest request,
        CancellationToken ct
    )
    {
        var package = request.Package;
        if (package == null || package.Pipelines == null || package.Pipelines.Count == 0)
        {
            return Result.Fail<ImportPipelinePackageResponseDto>("Package contains no pipelines to import.");
        }

        // 1. Install or Map Custom Scripts (Batch-First)
        var customNodeKeyToId = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var installedScriptsCount = 0;

        if (package.Dependencies?.CustomScripts != null && package.Dependencies.CustomScripts.Count > 0)
        {
            var scriptKeys = package.Dependencies.CustomScripts.Select(s => s.Key).ToList();
            var existingNodes = await db.NodeDefinitions
                .Where(nd => nd.ProjectId == request.ProjectId && scriptKeys.Contains(nd.Key))
                .ToListAsync(ct);

            var existingMap = existingNodes.ToDictionary(x => x.Key, x => x, StringComparer.OrdinalIgnoreCase);
            var scriptsToInstall = package.Dependencies.CustomScripts
                .Where(s => !existingMap.ContainsKey(s.Key))
                .ToList();

            foreach (var (k, v) in existingMap)
            {
                customNodeKeyToId[k] = v.Id;
            }

            if (scriptsToInstall.Count > 0)
            {
                // A. Chuẩn bị Batch Request Upload cho toàn bộ scripts cần cài đặt
                var scriptUploadItems = new List<(PipelinePackageScriptDto script, byte[] bytes, UploadRequestItemDto req)>();

                foreach (var s in scriptsToInstall)
                {
                    var text = s.ScriptContent ?? string.Empty;
                    var bytes = System.Text.Encoding.UTF8.GetBytes(text);
                    var sha256Hex = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
                    var fileName = string.IsNullOrWhiteSpace(s.FileName) ? $"{s.Key}.py" : s.FileName.Trim();
                    var ext = Path.GetExtension(fileName).ToLowerInvariant();
                    if (string.IsNullOrWhiteSpace(ext)) ext = ".py";

                    var reqItem = new UploadRequestItemDto(
                        sha256Hex,
                        ext,
                        bytes.Length,
                        "text/x-python"
                    );

                    scriptUploadItems.Add((s, bytes, reqItem));
                }

                // B. Batch Request Upload tới IAssetApi (CAS Deduplication)
                var batchUploadResult = await assetApi.RequestUploadAsync(
                    scriptUploadItems.Select(x => x.req),
                    ct
                );

                var scriptToAssetMap = new Dictionary<string, (Guid assetId, string hash, string fileName)>(StringComparer.OrdinalIgnoreCase);

                if (batchUploadResult.IsSuccess && batchUploadResult.Value != null)
                {
                    var uploadDtos = batchUploadResult.Value.ToList();
                    var client = httpClientFactory.CreateClient();
                    var assetsToConfirm = new List<Guid>();

                    for (var i = 0; i < scriptUploadItems.Count; i++)
                    {
                        var (scriptItem, bytes, reqItem) = scriptUploadItems[i];
                        var uploadDto = uploadDtos.FirstOrDefault(u => u.HashSha256.Equals(reqItem.HashSha256, StringComparison.OrdinalIgnoreCase));

                        if (uploadDto != null)
                        {
                            if (!uploadDto.IsAlreadyExists && !string.IsNullOrWhiteSpace(uploadDto.PresignedUrl))
                            {
                                using var content = new ByteArrayContent(bytes);
                                content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("text/x-python");
                                var putResp = await client.PutAsync(uploadDto.PresignedUrl, content, ct);
                                if (putResp.IsSuccessStatusCode)
                                {
                                    assetsToConfirm.Add(uploadDto.AssetId);
                                }
                            }

                            scriptToAssetMap[scriptItem.Key] = (uploadDto.AssetId, reqItem.HashSha256, reqItem.Extension);
                        }
                    }

                    // C. Batch Confirm Upload cho các asset mới tải lên
                    if (assetsToConfirm.Count > 0)
                    {
                        await assetApi.ConfirmUploadAsync(assetsToConfirm, ct);
                    }
                }

                // D. Batch Tạo NodeDefinition và liên kết AssetLink
                foreach (var script in scriptsToInstall)
                {
                    var nodeDef = new NodeDefinition
                    {
                        ProjectId = request.ProjectId,
                        Key = script.Key,
                        ContentHash = script.ContentHash ?? string.Empty
                    };

                    nodeDef.Update(
                        string.IsNullOrWhiteSpace(script.Name) ? script.Key : script.Name.Trim(),
                        string.IsNullOrWhiteSpace(script.Label) ? script.Key : script.Label.Trim(),
                        string.IsNullOrWhiteSpace(script.Executor) ? "blender" : script.Executor.Trim().ToLowerInvariant(),
                        script.Inputs?.ToList() ?? [],
                        script.Outputs?.ToList() ?? []
                    );

                    db.NodeDefinitions.Add(nodeDef);
                    await db.SaveChangesAsync(ct);

                    if (scriptToAssetMap.TryGetValue(script.Key, out var assetInfo))
                    {
                        var owner = new AssetLinkOwner(nameof(NodeDefinition), nodeDef.Id.ToString(), PipelineAssetSlots.CustomScript);
                        var fileName = string.IsNullOrWhiteSpace(script.FileName) ? $"{script.Key}.py" : script.FileName.Trim();
                        var linkRes = await assetApi.ReplaceSingleLinkAsync(
                            new AssetLinkRequestItem(assetInfo.assetId, fileName),
                            owner,
                            assetInfo.hash,
                            ct
                        );

                        if (linkRes.IsSuccess)
                        {
                            nodeDef.ContentHash = linkRes.Value.HashSha256;
                            nodeDef.Status = NodeLifecycleStatus.Published;
                            await db.SaveChangesAsync(ct);
                        }
                    }

                    customNodeKeyToId[script.Key] = nodeDef.Id;
                    installedScriptsCount++;
                }
            }
        }

        // 2. Prepare Maps and Topological Sequence
        var tempToRealPipelineMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var importedSummaries = new List<ImportedPipelineSummaryDto>();

        // Sort by ImportOrder (Leaf-first) so child subpipelines exist before parent pipelines
        var orderedPipelines = package.Pipelines.OrderBy(p => p.ImportOrder).ToList();

        // Query existing pipeline names in this project to resolve potential conflicts
        var existingNames = await db.Pipelines
            .AsNoTracking()
            .Where(p => p.ProjectId == request.ProjectId)
            .Select(p => p.Name)
            .ToListAsync(ct);

        var usedNames = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);

        // 3. Create Pipelines in topological order
        foreach (var pItem in orderedPipelines)
        {
            var newPipelineId = IdGenerator.NewId();
            tempToRealPipelineMap[pItem.BundleId] = newPipelineId;

            // Resolve name with prefix if provided, avoiding duplicate collisions
            var baseName = string.IsNullOrWhiteSpace(request.NamePrefix)
                ? pItem.Name.Trim()
                : $"{request.NamePrefix.Trim()} {pItem.Name.Trim()}".Trim();

            var candidateName = baseName;
            var counter = 1;
            while (!usedNames.Add(candidateName))
            {
                candidateName = $"{baseName} (Imported{(counter > 1 ? $" {counter}" : "")})";
                counter++;
            }

            var pipeline = new Domain.Entities.Pipeline(
                request.ProjectId,
                candidateName,
                pItem.TriggerType,
                pItem.TriggerConfig
            );
            pipeline.Id = newPipelineId;

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

            // Map and add Nodes
            var nodeMapForCurrentPipeline = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);

            foreach (var n in pItem.Graph?.Nodes ?? [])
            {
                var newNodeId = IdGenerator.NewId();
                nodeMapForCurrentPipeline[n.TempId] = newNodeId;

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
                        tempToRealPipelineMap.TryGetValue(targetBundleId, out var realChildId))
                    {
                        refId = realChildId.ToString();
                        configValues["pipelineId"] = realChildId;
                    }
                }
                else if (n.Kind == PipelineNodeKind.Custom)
                {
                    // Remap custom script node ID if matched by CustomScriptKey or RefId
                    var lookupKey = !string.IsNullOrWhiteSpace(n.CustomScriptKey)
                        ? n.CustomScriptKey
                        : n.RefId;

                    if (customNodeKeyToId.TryGetValue(lookupKey, out var customNodeDefId))
                    {
                        refId = customNodeDefId.ToString();
                    }
                }

                JsonDocument? configDoc = null;
                if (configValues.Count > 0)
                {
                    configDoc = JsonDocument.Parse(JsonSerializer.Serialize(configValues));
                }

                JsonDocument? metadataDoc = null;
                if (n.Metadata != null && n.Metadata.Count > 0)
                {
                    metadataDoc = JsonDocument.Parse(JsonSerializer.Serialize(n.Metadata));
                }

                var nodeEntity = new PipelineNode(
                    id: newNodeId,
                    pipelineId: newPipelineId,
                    refId: refId,
                    kind: n.Kind,
                    positionX: n.Position.X,
                    positionY: n.Position.Y,
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
                    nodeMapForCurrentPipeline.TryGetValue(n.ParentTempId, out var parentNodeId))
                {
                    var currentRealNodeId = nodeMapForCurrentPipeline[n.TempId];
                    var nodeEntity = pipeline.Nodes.FirstOrDefault(x => x.Id == currentRealNodeId);
                    if (nodeEntity != null)
                    {
                        nodeEntity.ParentId = parentNodeId;
                    }
                }
            }

            // Map and add Edges
            foreach (var edge in pItem.Graph?.Edges ?? [])
            {
                if (nodeMapForCurrentPipeline.TryGetValue(edge.SourceNodeTempId, out var realSourceNodeId) &&
                    nodeMapForCurrentPipeline.TryGetValue(edge.TargetNodeTempId, out var realTargetNodeId))
                {
                    pipeline.AddEdge(
                        sourcePipelineNodeId: realSourceNodeId,
                        sourcePin: edge.SourcePin,
                        targetPipelineNodeId: realTargetNodeId,
                        targetPin: edge.TargetPin,
                        id: Guid.NewGuid(),
                        kind: edge.Kind
                    );
                }
            }

            db.Pipelines.Add(pipeline);

            importedSummaries.Add(new ImportedPipelineSummaryDto(
                BundleId: pItem.BundleId,
                PipelineId: newPipelineId,
                Name: candidateName,
                IsRoot: pItem.IsRoot
            ));
        }

        // Commit all changes in a single atomic database transaction
        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "ImportPipelinePackageHandler: Successfully imported {Count} pipelines ({RootCount} root) with {ScriptCount} scripts into Project {ProjectId}",
            importedSummaries.Count,
            importedSummaries.Count(p => p.IsRoot),
            installedScriptsCount,
            request.ProjectId
        );

        return Result.Ok(new ImportPipelinePackageResponseDto(
            ImportedPipelinesCount: importedSummaries.Count,
            Pipelines: importedSummaries,
            InstalledScriptsCount: installedScriptsCount
        ));
    }
}
