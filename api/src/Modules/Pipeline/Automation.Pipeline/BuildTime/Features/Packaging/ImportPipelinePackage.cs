using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Studio.Contracts;
namespace Automation.Pipeline.BuildTime.Features.Packaging;

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
    ILogger<ImportPipelinePackageHandler> logger,
    ITransientPipelineGraphFactory transientFactory,
    IPipelineContractValidator contractValidator,
    IProjectsApi? projectsApi = null
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

        // Lấy target StorageProfileId từ Project đích nếu có cấu hình riêng (BYOS)
        Guid? targetStorageProfileId = null;
        if (projectsApi != null)
        {
            targetStorageProfileId = await projectsApi.GetProjectStorageProfileIdAsync(request.ProjectId, ct);
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

            // Lọc ra các script có nội dung hợp lệ (bỏ qua script rỗng)
            var validScriptsToInstall = scriptsToInstall
                .Where(s => !string.IsNullOrWhiteSpace(s.ScriptContent))
                .ToList();

            if (validScriptsToInstall.Count > 0)
            {
                // A. Chuẩn bị Batch Request Upload cho toàn bộ scripts cần cài đặt
                var scriptUploadItems = new List<(PipelinePackageScriptDto script, byte[] bytes, UploadRequestItemDto req)>();

                foreach (var s in validScriptsToInstall)
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

                // B. Batch Request Upload tới IAssetApi với đúng target targetStorageProfileId
                var batchUploadResult = await assetApi.RequestUploadAsync(
                    scriptUploadItems.Select(x => x.req),
                    targetStorageProfileId,
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

        // 2. Dựng các thực thể Pipeline và kiểm tra cấu trúc đồ thị qua TransientPipelineGraphFactory
        var buildResult = await transientFactory.BuildFromPackageAsync(
            request.ProjectId,
            package,
            request.NamePrefix,
            ct
        );

        // Kiểm tra xem có bất kỳ lỗi cấu trúc nghiêm trọng nào chặn Import không
        foreach (var item in buildResult.Items)
        {
            var valResult = await contractValidator.ValidateGraphAsync(item.Pipeline, item.Context, ct: ct);
            var nodesById = item.Pipeline.Nodes.ToDictionary(n => n.Id);
            var structuralError = valResult.Diagnostics.FirstOrDefault(d => transientFactory.IsStructuralImportBlocker(d, nodesById));
            if (structuralError != null)
            {
                return Result.Fail<ImportPipelinePackageResponseDto>(
                    $"Cannot import package: Pipeline '{item.Pipeline.Name}' has a structural error: {structuralError.Message}"
                );
            }
        }

        // 3. Clone / Resolve File Links và thêm các Pipelines vào Database
        var importedSummaries = new List<ImportedPipelineSummaryDto>();

        foreach (var item in buildResult.Items)
        {
            var nodesByTempId = item.Pipeline.Nodes.ToDictionary(n => item.NodeIdToTempIdMap[n.Id]);

            foreach (var n in item.SourceDto.Graph?.Nodes ?? [])
            {
                if (!nodesByTempId.TryGetValue(n.TempId, out var nodeEntity)) continue;

                var configValues = n.ConfigValues != null
                    ? new Dictionary<string, object?>(n.ConfigValues)
                    : new Dictionary<string, object?>();

                var configChanged = false;

                foreach (var (k, v) in configValues.ToList())
                {
                    if (PipelineFileValue.TryGetLinkId(v, out var fileLinkId))
                    {
                        var owner = PipelineFileValue.Owner(nodeEntity.Id, k);
                        var cloneResult = await assetApi.ResolveOrCloneLinkAsync(fileLinkId, owner, ct);
                        if (cloneResult.IsSuccess)
                        {
                            var finalLinkId = cloneResult.Value.AssetLinkId;

                            // Nếu target Project có cấu hình Storage Profile riêng (BYOS), di chuyển Asset sang storage đích
                            if (targetStorageProfileId.HasValue)
                            {
                                var migrateResult = await assetApi.MigrateAssetsStorageAsync(
                                    [new MigrateAssetItem(cloneResult.Value.AssetId, DeleteSource: false)],
                                    targetStorageProfileId,
                                    ct: ct
                                );

                                if (migrateResult.IsSuccess && migrateResult.Value.Count > 0 && migrateResult.Value[0].IsSuccess)
                                {
                                    var migratedAssetId = migrateResult.Value[0].MigratedAssetId;
                                    if (migratedAssetId.HasValue && migratedAssetId.Value != cloneResult.Value.AssetId)
                                    {
                                        var relinkResult = await assetApi.CreateLinkAsync(
                                            new AssetLinkRequestItem(migratedAssetId.Value, cloneResult.Value.OriginalName),
                                            owner,
                                            ct: ct
                                        );
                                        if (relinkResult.IsSuccess)
                                        {
                                            finalLinkId = relinkResult.Value.AssetLinkId;
                                        }
                                    }
                                }
                            }

                            configValues[k] = new PipelineFileParameter(finalLinkId);
                            configChanged = true;
                        }
                        else
                        {
                            PipelinePackageFilePinMetadataDto? pinMeta = null;
                            n.FilePins?.TryGetValue(k, out pinMeta);
                            logger.LogInformation(
                                "Could not resolve asset link {LinkId} for imported node {NodeId} slot {SlotKey}. Preserving as Unbound Pin.",
                                fileLinkId,
                                nodeEntity.Id,
                                k
                            );
                            configValues[k] = new
                            {
                                status = "unbound",
                                originalFileName = pinMeta?.OriginalFileName,
                                hashSha256 = pinMeta?.HashSha256,
                                sizeBytes = pinMeta?.SizeBytes,
                                contentType = pinMeta?.ContentType
                            };
                            configChanged = true;
                        }
                    }
                }

                if (configChanged)
                {
                    nodeEntity.UpdateConfig(JsonSerializer.SerializeToDocument(configValues));
                }
            }

            db.Pipelines.Add(item.Pipeline);
            foreach (var node in item.Pipeline.Nodes)
            {
                db.PipelineNodes.Add(node);
            }
            foreach (var edge in item.Pipeline.Edges)
            {
                db.PipelineEdges.Add(edge);
            }

            var postImportVal = await contractValidator.ValidateGraphAsync(item.Pipeline, item.Context, ct: ct);

            importedSummaries.Add(new ImportedPipelineSummaryDto(
                BundleId: item.SourceDto.BundleId,
                PipelineId: item.Pipeline.Id,
                Name: item.ResolvedName,
                IsRoot: item.SourceDto.IsRoot,
                IsValid: postImportVal.IsValid,
                Diagnostics: postImportVal.Diagnostics
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
