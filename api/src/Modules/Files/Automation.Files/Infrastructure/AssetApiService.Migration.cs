using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using FluentResults;
using Microsoft.EntityFrameworkCore;

namespace Automation.Files.Infrastructure;

public partial class AssetApiService
{
    public async Task<Result<IReadOnlyList<MigrateAssetItemResult>>> MigrateAssetsStorageAsync(
        IEnumerable<MigrateAssetItem> items,
        Guid? targetStorageProfileId,
        IProgress<StorageMigrationProgress>? progress = null,
        Guid? trackingJobId = null,
        CancellationToken ct = default
    )
    {
        var requested = items.ToList();
        if (requested.Count == 0) return Result.Ok<IReadOnlyList<MigrateAssetItemResult>>([]);

        var jobId = trackingJobId ?? Guid.NewGuid();
        var assetIds = requested.Select(x => x.AssetId).Distinct().ToList();
        var sourceAssets = await dbContext.Assets
            .Where(a => assetIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, ct);

        var targetStorageService = await storageFactory.GetStorageServiceAsync(targetStorageProfileId, ct);

        var results = new List<MigrateAssetItemResult>();
        var totalBytes = sourceAssets.Values.Sum(a => a.SizeBytes);
        var transferredBytes = 0L;
        var processedCount = 0;

        foreach (var req in requested)
        {
            ct.ThrowIfCancellationRequested();

            if (!sourceAssets.TryGetValue(req.AssetId, out var sourceAsset))
            {
                results.Add(new MigrateAssetItemResult(
                    SourceAssetId: req.AssetId,
                    MigratedAssetId: null,
                    StoragePath: null,
                    IsSuccess: false,
                    WasDeduplicated: false,
                    ErrorMessage: $"Asset with ID '{req.AssetId}' not found."
                ));
                processedCount++;
                progress?.Report(new StorageMigrationProgress(
                    jobId, requested.Count, processedCount, transferredBytes, totalBytes,
                    string.Empty, requested.Count > 0 ? (double)processedCount / requested.Count * 100 : 100
                ));
                continue;
            }

            // Nếu cùng StorageProfileId: không cần di chuyển vật lý
            if (sourceAsset.StorageProfileId == targetStorageProfileId)
            {
                results.Add(new MigrateAssetItemResult(
                    SourceAssetId: sourceAsset.Id,
                    MigratedAssetId: sourceAsset.Id,
                    StoragePath: sourceAsset.StoragePath,
                    IsSuccess: true,
                    WasDeduplicated: true
                ));
                transferredBytes += sourceAsset.SizeBytes;
                processedCount++;
                progress?.Report(new StorageMigrationProgress(
                    jobId, requested.Count, processedCount, transferredBytes, totalBytes,
                    sourceAsset.StoragePath, (double)processedCount / requested.Count * 100
                ));
                continue;
            }

            try
            {
                // 1. Kiểm tra CAS Deduplication trên Target Storage
                var existingTargetAsset = await dbContext.Assets
                    .FirstOrDefaultAsync(a => a.StorageProfileId == targetStorageProfileId && 
                                              a.HashSha256 == sourceAsset.HashSha256 && 
                                              a.IsConfirmed, ct);

                if (existingTargetAsset != null)
                {
                    Guid targetAssetId = existingTargetAsset.Id;
                    if (req.DeleteSource)
                    {
                        await CleanupSourceAssetAfterMigrationAsync(sourceAsset, ct);
                    }

                    results.Add(new MigrateAssetItemResult(
                        SourceAssetId: sourceAsset.Id,
                        MigratedAssetId: targetAssetId,
                        StoragePath: existingTargetAsset.StoragePath,
                        IsSuccess: true,
                        WasDeduplicated: true
                    ));

                    transferredBytes += sourceAsset.SizeBytes;
                    processedCount++;
                    progress?.Report(new StorageMigrationProgress(
                        jobId, requested.Count, processedCount, transferredBytes, totalBytes,
                        existingTargetAsset.StoragePath, (double)processedCount / requested.Count * 100
                    ));
                    continue;
                }

                // 2. Piped Streaming
                var sourceStorageService = await storageFactory.GetStorageServiceAsync(sourceAsset.StorageProfileId, ct);
                var extension = sourceAsset.Extension.StartsWith('.') ? sourceAsset.Extension : $".{sourceAsset.Extension}";
                var targetStoragePath = $"assets/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid()}{extension}";

                using (var sourceStream = await sourceStorageService.OpenReadStreamAsync(sourceAsset.StoragePath, ct))
                {
                    await targetStorageService.UploadStreamAsync(
                        targetStoragePath,
                        sourceStream,
                        sourceAsset.ContentType,
                        sourceAsset.SizeBytes,
                        ct
                    );
                }

                // 3. Tạo bản ghi Asset mới trên Target Storage
                var newTargetAsset = new Asset(
                    storagePath: targetStoragePath,
                    sizeBytes: sourceAsset.SizeBytes,
                    contentType: sourceAsset.ContentType,
                    extension: sourceAsset.Extension,
                    hashSha256: sourceAsset.HashSha256,
                    storageProfileId: targetStorageProfileId
                );
                newTargetAsset.MarkAsConfirmed();
                dbContext.Assets.Add(newTargetAsset);
                await dbContext.SaveChangesAsync(ct);

                // 4. Nếu DeleteSource = true:
                if (req.DeleteSource)
                {
                    var affectedLinks = await dbContext.AssetLinks
                        .Where(l => l.AssetId == sourceAsset.Id)
                        .ToListAsync(ct);
                    foreach (var link in affectedLinks)
                    {
                        link.AssetId = newTargetAsset.Id;
                    }
                    await dbContext.SaveChangesAsync(ct);

                    await CleanupSourceAssetAfterMigrationAsync(sourceAsset, ct);
                }

                results.Add(new MigrateAssetItemResult(
                    SourceAssetId: sourceAsset.Id,
                    MigratedAssetId: newTargetAsset.Id,
                    StoragePath: targetStoragePath,
                    IsSuccess: true,
                    WasDeduplicated: false
                ));

                transferredBytes += sourceAsset.SizeBytes;
                processedCount++;
                progress?.Report(new StorageMigrationProgress(
                    jobId, requested.Count, processedCount, transferredBytes, totalBytes,
                    targetStoragePath, (double)processedCount / requested.Count * 100
                ));
            }
            catch (Exception ex)
            {
                results.Add(new MigrateAssetItemResult(
                    SourceAssetId: sourceAsset.Id,
                    MigratedAssetId: null,
                    StoragePath: null,
                    IsSuccess: false,
                    WasDeduplicated: false,
                    ErrorMessage: ex.Message
                ));
                processedCount++;
                progress?.Report(new StorageMigrationProgress(
                    jobId, requested.Count, processedCount, transferredBytes, totalBytes,
                    sourceAsset.StoragePath, (double)processedCount / requested.Count * 100
                ));
            }
        }

        return Result.Ok<IReadOnlyList<MigrateAssetItemResult>>(results);
    }

    private async Task CleanupSourceAssetAfterMigrationAsync(Asset sourceAsset, CancellationToken ct)
    {
        var sharedPathCount = await dbContext.Assets
            .CountAsync(a => a.Id != sourceAsset.Id && 
                             a.StorageProfileId == sourceAsset.StorageProfileId && 
                             a.StoragePath == sourceAsset.StoragePath, ct);

        if (sharedPathCount == 0)
        {
            try
            {
                var sourceStorage = await storageFactory.GetStorageServiceAsync(sourceAsset.StorageProfileId, ct);
                await sourceStorage.DeleteAsync(sourceAsset.StoragePath, ct);
            }
            catch
            {
                // Bỏ qua lỗi xóa physical source để không làm hỏng luồng chính
            }
        }

        dbContext.Assets.Remove(sourceAsset);
        await dbContext.SaveChangesAsync(ct);
    }
}
