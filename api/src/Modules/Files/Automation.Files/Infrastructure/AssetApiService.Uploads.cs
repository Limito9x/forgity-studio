using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using FluentResults;
using Microsoft.EntityFrameworkCore;

namespace Automation.Files.Infrastructure;

public partial class AssetApiService
{
    public async Task<Result<IReadOnlyList<AssetUploadDto>>> RequestUploadAsync(
        IEnumerable<UploadRequestItemDto> requests,
        Guid? storageProfileId = null,
        CancellationToken ct = default
    )
    {
        var resultList = new List<AssetUploadDto>();
        var requestList = requests.ToList();
        if (requestList.Count == 0)
            return Result.Ok<IReadOnlyList<AssetUploadDto>>(resultList);

        Domain.Entities.StorageProfile? profile = null;
        if (storageProfileId.HasValue && storageProfileId.Value != Guid.Empty)
        {
            profile = await dbContext.StorageProfiles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == storageProfileId.Value, ct);
            if (profile == null)
            {
                return Result.Fail<IReadOnlyList<AssetUploadDto>>($"Storage profile '{storageProfileId.Value}' was not found.");
            }
        }

        var hashes = requestList.Select(x => x.HashSha256).Distinct().ToList();
        var existingAssets = await dbContext
            .Assets.Where(x => hashes.Contains(x.HashSha256) && x.StorageProfileId == storageProfileId)
            .ToListAsync(ct);

        long? effectiveQuotaBytes = profile?.StorageQuotaBytes;
        if (profile == null || profile.ProviderType == Domain.Enums.StorageProviderType.StudioCloud)
        {
            if (!effectiveQuotaBytes.HasValue)
            {
                effectiveQuotaBytes = await GetStudioCloudDefaultQuotaBytesAsync(ct);
            }
        }

        if (effectiveQuotaBytes.HasValue)
        {
            var currentUsedBytes = await dbContext.Assets
                .Where(x => x.StorageProfileId == storageProfileId || (storageProfileId == null && x.StorageProfileId == null))
                .SumAsync(x => (long?)x.SizeBytes, ct) ?? 0L;

            var incomingBytes = requestList
                .Where(r => !existingAssets.Any(e => e.HashSha256 == r.HashSha256 && e.SizeBytes == r.SizeBytes && e.IsConfirmed))
                .Sum(r => r.SizeBytes);

            if (currentUsedBytes + incomingBytes > effectiveQuotaBytes.Value)
            {
                var usedMb = Math.Round((double)currentUsedBytes / (1024 * 1024), 2);
                var incomingMb = Math.Round((double)incomingBytes / (1024 * 1024), 2);
                var quotaMb = Math.Round((double)effectiveQuotaBytes.Value / (1024 * 1024), 2);
                return Result.Fail<IReadOnlyList<AssetUploadDto>>(
                    $"Storage quota exceeded for '{profile?.Name ?? "Studio Cloud"}'. Used: {usedMb}MB, Incoming: {incomingMb}MB, Quota: {quotaMb}MB.");
            }
        }

        var storageService = await storageFactory.GetStorageServiceAsync(storageProfileId, ct);
        var newAssets = new List<Asset>();
        var urlTasks = new List<(Asset asset, Task<string> urlTask)>();

        foreach (var req in requestList)
        {
            var existing = existingAssets.FirstOrDefault(x =>
                x.HashSha256 == req.HashSha256 && x.SizeBytes == req.SizeBytes
            );
            if (existing != null && existing.IsConfirmed)
            {
                resultList.Add(
                    new AssetUploadDto(
                        existing.Id,
                        req.HashSha256,
                        true,
                        null,
                        storageService.GetPublicUrl(existing.StoragePath)
                    )
                );
                continue;
            }

            var asset = existing;
            var dir1 = req.HashSha256.Substring(0, 2);
            var dir2 = req.HashSha256.Substring(2, 2);
            var storagePath = $"{dir1}/{dir2}/{req.HashSha256}{req.Extension}";

            if (asset == null)
            {
                asset = new Asset(
                    storagePath,
                    req.SizeBytes,
                    req.ContentType,
                    req.Extension,
                    req.HashSha256,
                    storageProfileId
                );
                newAssets.Add(asset);
                existingAssets.Add(asset);
            }

            var urlTask = storageService.GeneratePresignedUploadUrlAsync(
                storagePath,
                req.ContentType,
                TimeSpan.FromMinutes(15),
                ct
            );
            urlTasks.Add((asset, urlTask));
        }

        if (newAssets.Count > 0)
        {
            dbContext.Assets.AddRange(newAssets);
        }

        foreach (var tuple in urlTasks)
        {
            var url = await tuple.urlTask;
            resultList.Add(
                new AssetUploadDto(tuple.asset.Id, tuple.asset.HashSha256, false, url, null)
            );
        }

        if (newAssets.Count > 0)
        {
            await dbContext.SaveChangesAsync(ct);
        }

        return Result.Ok<IReadOnlyList<AssetUploadDto>>(resultList);
    }

    public async Task<Result<IReadOnlyList<ConfirmAssetDto>>> ConfirmUploadAsync(
        IEnumerable<Guid> assetIds,
        CancellationToken ct = default
    )
    {
        var idList = assetIds.ToList();
        if (idList.Count == 0)
            return Result.Ok<IReadOnlyList<ConfirmAssetDto>>(Array.Empty<ConfirmAssetDto>());

        var assets = await dbContext.Assets.Where(x => idList.Contains(x.Id)).ToListAsync(ct);

        var missingIds = idList.Except(assets.Select(x => x.Id)).ToList();
        if (missingIds.Count > 0)
        {
            return Result.Fail($"Assets not found: {string.Join(", ", missingIds)}");
        }

        var unconfirmedAssets = assets.Where(x => !x.IsConfirmed).ToList();
        if (unconfirmedAssets.Count == 0)
            return Result.Ok<IReadOnlyList<ConfirmAssetDto>>(Array.Empty<ConfirmAssetDto>());

        var verifyTasks = unconfirmedAssets.Select(async asset =>
        {
            var service = await storageFactory.GetStorageServiceAsync(asset.StorageProfileId, ct);
            var actualSize = await service.GetFileSizeAsync(asset.StoragePath, ct);
            if (actualSize == null)
                return Result.Fail($"File not found on storage for asset '{asset.Id}'.");

            if (actualSize.Value != asset.SizeBytes)
                return Result.Fail(
                    $"File size mismatch for asset '{asset.Id}'. Expected {asset.SizeBytes}, but found {actualSize.Value}."
                );

            asset.MarkAsConfirmed();
            return Result.Ok();
        });

        var results = await Task.WhenAll(verifyTasks);
        var errors = results.Where(r => r.IsFailed).SelectMany(r => r.Errors).ToList();
        if (errors.Count > 0)
            return Result.Fail(errors);

        await dbContext.SaveChangesAsync(ct);

        var resultAssets = unconfirmedAssets
            .Select(asset => new ConfirmAssetDto(
                asset.Id,
                asset.ContentType,
                asset.SizeBytes,
                storageFactory.GetPublicUrl(asset.StorageProfileId, asset.StoragePath)
            ))
            .ToList();

        return Result.Ok<IReadOnlyList<ConfirmAssetDto>>(resultAssets);
    }
}
