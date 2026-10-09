using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using FluentResults;
using Microsoft.EntityFrameworkCore;

namespace Automation.Files.Infrastructure;

public class AssetApiService(
    FilesDbContext dbContext,
    IObjectStorageService storageService,
    AssetRegistry assetRegistry
) : IAssetApi
{
    public async Task<IReadOnlyList<AssetLinkSyncResult>> SyncLinksAsync(
        IEnumerable<AssetLinkSyncItem> items, CancellationToken ct = default)
    {
        var requested = items.ToList();
        if (requested.Count == 0) return [];
        ct.ThrowIfCancellationRequested();

        var ownerIds = requested.Select(x => x.Owner.EntityId).Distinct().ToList();
        var linkIds = requested.Where(x => x.AssetLinkId.HasValue).Select(x => x.AssetLinkId!.Value).ToList();
        var assetIds = requested.Where(x => x.File != null).Select(x => x.File!.AssetId).Distinct().ToList();
        var links = await dbContext.AssetLinks.AsNoTracking().Include(x => x.Asset)
            .Where(x => ownerIds.Contains(x.OwnerEntityId) || linkIds.Contains(x.Id))
            .OrderBy(x => x.Id).ToListAsync(ct);
        var assets = await dbContext.Assets.Where(x => assetIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var created = new List<AssetLink>();
        var results = new List<AssetLinkSyncResult>();

        foreach (var item in requested)
        {
            ct.ThrowIfCancellationRequested();
            void Fail(string code, string message) => results.Add(new(item.Owner, null, code, message));

            if (!IsValidOwner(item.Owner) || (item.File != null && item.AssetLinkId.HasValue) ||
                item.AssetLinkId == Guid.Empty ||
                (item.File != null && (item.File.AssetId == Guid.Empty ||
                    string.IsNullOrWhiteSpace(item.File.OriginalName) || item.File.OriginalName.Length > 500)))
            {
                Fail("InvalidRequest", "Supply a valid owner and either an upload or a link reference, not both.");
                continue;
            }
            var slot = assetRegistry.GetSlotOptions(item.Owner.EntityType, item.Owner.SlotKey);
            if (slot.IsFailed)
            {
                Fail("InvalidSlot", slot.Errors.First().Message);
                continue;
            }

            AssetLink? link = null;
            Asset? asset;
            if (item.AssetLinkId.HasValue)
            {
                link = links.FirstOrDefault(x => x.Id == item.AssetLinkId && MatchesOwner(x, item.Owner));
                if (link == null)
                {
                    Fail("LinkNotFound", "Asset link was not found for the specified owner and slot.");
                    continue;
                }
                asset = link.Asset;
            }
            else if (item.File != null)
            {
                if (!assets.TryGetValue(item.File.AssetId, out asset))
                {
                    Fail("AssetNotFound", "Asset was not found.");
                    continue;
                }
                link = links.FirstOrDefault(x => MatchesOwner(x, item.Owner) &&
                    x.AssetId == item.File.AssetId && x.OriginalName == item.File.OriginalName);
            }
            else
            {
                // A clear is only acknowledged here. The caller unlinks after its graph commits.
                results.Add(new(item.Owner, null));
                continue;
            }

            var error = ValidateLinkAsset(asset, slot.Value);
            if (error.HasValue)
            {
                Fail(error.Value.Code, error.Value.Message);
                continue;
            }
            if (link == null)
            {
                var count = links.Count(x => MatchesOwner(x, item.Owner));
                if ((!slot.Value.AllowMultiple && count > 0) ||
                    (slot.Value.MaxCount.HasValue && count >= slot.Value.MaxCount.Value))
                {
                    Fail("SlotFull", "This slot has reached its file limit; existing links were preserved.");
                    continue;
                }
                link = new AssetLink(asset.Id, item.Owner.EntityType, item.Owner.SlotKey,
                    item.Owner.EntityId, item.File!.OriginalName, 0) { Asset = asset };
                links.Add(link);
                created.Add(link);
            }
            results.Add(new(item.Owner, ToLinkDto(link)));
        }

        if (created.Count > 0)
        {
            dbContext.AssetLinks.AddRange(created);
            try
            {
                await dbContext.SaveChangesAsync(ct);
            }
            finally
            {
                // A failed save must not leave pending inserts for a later call on this context.
                foreach (var link in created) dbContext.Entry(link).State = EntityState.Detached;
            }
        }
        // Auditing may fill CreatedAt during save; return the persisted metadata.
        var savedLinks = created.ToDictionary(x => x.Id, ToLinkDto);
        return results.Select(x => x.Link != null && savedLinks.TryGetValue(x.Link.AssetLinkId, out var saved)
            ? x with { Link = saved }
            : x).ToList();
    }

    public async Task<Result<AssetLinkDto>> ReplaceSingleLinkAsync(
        AssetLinkRequestItem item, AssetLinkOwner owner,
        string? expectedHash = null, CancellationToken ct = default)
    {
        if (!IsValidOwner(owner) || item.AssetId == Guid.Empty || string.IsNullOrWhiteSpace(item.OriginalName) ||
            item.OriginalName.Length > 500)
            return Result.Fail<AssetLinkDto>("A valid owner, asset ID and filename are required.");
        var slot = assetRegistry.GetSlotOptions(owner.EntityType, owner.SlotKey);
        if (slot.IsFailed) return Result.Fail<AssetLinkDto>(slot.Errors);
        if (slot.Value.AllowMultiple)
            return Result.Fail<AssetLinkDto>("Replacement requires a single-file slot.");
        var asset = await dbContext.Assets.FirstOrDefaultAsync(x => x.Id == item.AssetId, ct);
        if (asset == null || !asset.IsConfirmed)
            return Result.Fail<AssetLinkDto>("Script asset must exist and be confirmed.");
        if (asset.SizeBytes > slot.Value.MaxSizeBytes ||
            (slot.Value.AllowedContentTypes is { Length: > 0 } &&
             !slot.Value.AllowedContentTypes.Contains(asset.ContentType, StringComparer.OrdinalIgnoreCase)))
            return Result.Fail<AssetLinkDto>("Asset does not meet the slot's file requirements.");
        if (string.IsNullOrWhiteSpace(asset.HashSha256) ||
            (!string.IsNullOrWhiteSpace(expectedHash) && !string.Equals(expectedHash, asset.HashSha256, StringComparison.OrdinalIgnoreCase)))
            return Result.Fail<AssetLinkDto>("Uploaded script hash does not match the analyzed content.");

        var existing = await dbContext.AssetLinks.Where(x => x.OwnerEntityType == owner.EntityType &&
            x.OwnerEntityId == owner.EntityId && x.SlotKey == owner.SlotKey).ToListAsync(ct);
        dbContext.AssetLinks.RemoveRange(existing);
        var link = new AssetLink(item.AssetId, owner.EntityType, owner.SlotKey, owner.EntityId, item.OriginalName, 0) { Asset = asset };
        dbContext.AssetLinks.Add(link);
        try
        {
            // EF saves the old-link removal and new-link insertion together in Files.
            await dbContext.SaveChangesAsync(ct);
            return Result.Ok(ToLinkDto(link));
        }
        finally
        {
            // Keep the scoped context usable if this file fails and the caller retries.
            foreach (var removed in existing) dbContext.Entry(removed).State = EntityState.Detached;
            dbContext.Entry(link).State = EntityState.Detached;
        }
    }

    public async Task<Result<AssetLinkDto>> CreateLinkAsync(
        AssetLinkRequestItem item,
        AssetLinkOwner owner,
        int sortOrder = 0,
        CancellationToken ct = default
    )
    {
        if (!IsValidOwner(owner) || item.AssetId == Guid.Empty ||
            string.IsNullOrWhiteSpace(item.OriginalName) || item.OriginalName.Length > 500 || sortOrder < 0)
            return Result.Fail<AssetLinkDto>("A valid owner, asset ID, original name and sort order are required.");

        var slotResult = assetRegistry.GetSlotOptions(owner.EntityType, owner.SlotKey);
        if (slotResult.IsFailed)
            return Result.Fail<AssetLinkDto>(slotResult.Errors);

        var asset = await dbContext.Assets.FirstOrDefaultAsync(x => x.Id == item.AssetId, ct);
        if (asset == null)
            return Result.Fail<AssetLinkDto>($"Asset '{item.AssetId}' not found.");
        var options = slotResult.Value;
        var error = ValidateLinkAsset(asset, options);
        if (error.HasValue) return Result.Fail<AssetLinkDto>(error.Value.Message);

        var count = await dbContext.AssetLinks.CountAsync(x =>
            x.OwnerEntityType == owner.EntityType && x.OwnerEntityId == owner.EntityId &&
            x.SlotKey == owner.SlotKey, ct);
        if ((!options.AllowMultiple && count > 0) ||
            (options.MaxCount.HasValue && count >= options.MaxCount.Value))
            return Result.Fail<AssetLinkDto>("This slot has reached its file limit; existing links were preserved.");

        // Do not deduplicate by AssetId: separate links may have different original names.
        var link = new AssetLink(item.AssetId, owner.EntityType, owner.SlotKey,
            owner.EntityId, item.OriginalName, sortOrder) { Asset = asset };
        dbContext.AssetLinks.Add(link);
        await dbContext.SaveChangesAsync(ct);
        return Result.Ok(ToLinkDto(link));
    }

    public async Task<Result<IReadOnlyList<AssetLinkDto>>> GetLinksByIdsAsync(
        IEnumerable<AssetLinkReference> references,
        CancellationToken ct = default
    )
    {
        var requested = references.ToList();
        if (requested.Any(x => x.AssetLinkId == Guid.Empty || !IsValidOwner(x.Owner)))
            return Result.Fail<IReadOnlyList<AssetLinkDto>>("A valid link ID and owner are required.");
        if (requested.Count == 0)
            return Result.Ok<IReadOnlyList<AssetLinkDto>>(Array.Empty<AssetLinkDto>());

        var ids = requested.Select(x => x.AssetLinkId).Distinct().ToList();
        var links = await dbContext.AssetLinks.AsNoTracking().Include(x => x.Asset)
            .Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        foreach (var reference in requested)
        {
            if (!links.TryGetValue(reference.AssetLinkId, out var link) || !MatchesOwner(link, reference.Owner))
                return Result.Fail<IReadOnlyList<AssetLinkDto>>($"Asset link '{reference.AssetLinkId}' was not found for the specified owner and slot.");
            if (!link.Asset.IsConfirmed)
                return Result.Fail<IReadOnlyList<AssetLinkDto>>($"Asset link '{reference.AssetLinkId}' references an unconfirmed asset.");
        }

        return Result.Ok<IReadOnlyList<AssetLinkDto>>(ids.Select(id => ToLinkDto(links[id])).ToList());
    }

    public async Task<Result<IReadOnlyList<AssetLinkDto>>> FindLinksByIdsAsync(
        IEnumerable<AssetLinkReference> references,
        CancellationToken ct = default
    )
    {
        var requested = references.ToList();
        if (requested.Any(x => x.AssetLinkId == Guid.Empty || !IsValidOwner(x.Owner)))
            return Result.Fail<IReadOnlyList<AssetLinkDto>>("A valid link ID and owner are required.");
        var ids = requested.Select(x => x.AssetLinkId).Distinct().ToList();
        if (ids.Count == 0) return Result.Ok<IReadOnlyList<AssetLinkDto>>(Array.Empty<AssetLinkDto>());
        var links = await dbContext.AssetLinks.AsNoTracking().Include(x => x.Asset)
            .Where(x => ids.Contains(x.Id) && x.Asset.IsConfirmed).ToListAsync(ct);
        return Result.Ok<IReadOnlyList<AssetLinkDto>>(links
            .Where(link => requested.Any(reference => reference.AssetLinkId == link.Id && MatchesOwner(link, reference.Owner)))
            .Select(ToLinkDto).ToList());
    }

    public async Task<Result<AssetLinkDto>> ResolveOrCloneLinkAsync(
        Guid assetLinkId,
        AssetLinkOwner targetOwner,
        CancellationToken ct = default
    )
    {
        if (assetLinkId == Guid.Empty || !IsValidOwner(targetOwner))
            return Result.Fail<AssetLinkDto>("A valid link ID and target owner are required.");

        var existingLink = await dbContext.AssetLinks.AsNoTracking().Include(x => x.Asset)
            .FirstOrDefaultAsync(x => x.Id == assetLinkId, ct);

        if (existingLink == null)
            return Result.Fail<AssetLinkDto>($"Asset link '{assetLinkId}' not found.");

        if (MatchesOwner(existingLink, targetOwner))
        {
            if (!existingLink.Asset.IsConfirmed)
                return Result.Fail<AssetLinkDto>($"Asset link '{assetLinkId}' references an unconfirmed asset.");
            return Result.Ok(ToLinkDto(existingLink));
        }

        var slotResult = assetRegistry.GetSlotOptions(targetOwner.EntityType, targetOwner.SlotKey);
        if (slotResult.IsFailed)
            return Result.Fail<AssetLinkDto>(slotResult.Errors);

        return await CreateLinkAsync(
            new AssetLinkRequestItem(existingLink.AssetId, existingLink.OriginalName),
            targetOwner,
            existingLink.SortOrder,
            ct
        );
    }

    public async Task<Result> RemoveLinkByIdAsync(
        AssetLinkReference reference,
        CancellationToken ct = default
    )
    {
        if (reference.AssetLinkId == Guid.Empty || !IsValidOwner(reference.Owner))
            return Result.Fail("A valid link ID and owner are required.");
        var link = await dbContext.AssetLinks.FirstOrDefaultAsync(x => x.Id == reference.AssetLinkId, ct);
        if (link == null)
            return Result.Ok();
        if (!MatchesOwner(link, reference.Owner))
            return Result.Fail("Asset link does not belong to the specified owner and slot.");

        dbContext.AssetLinks.Remove(link);
        await dbContext.SaveChangesAsync(ct);
        return Result.Ok();
    }

    private static (string Code, string Message)? ValidateLinkAsset(Asset asset, AssetCategoryOptions options)
    {
        if (!asset.IsConfirmed)
            return ("AssetUnconfirmed", $"Asset '{asset.Id}' has not been confirmed.");
        if (asset.SizeBytes > options.MaxSizeBytes)
            return ("FileTooLarge", "File size exceeds the maximum allowed size for this slot.");
        if (options.AllowedContentTypes is { Length: > 0 } &&
            !options.AllowedContentTypes.Contains(asset.ContentType, StringComparer.OrdinalIgnoreCase))
            return ("ContentTypeNotAllowed", $"Content type '{asset.ContentType}' is not allowed for this slot.");
        return null;
    }

    private static bool IsValidOwner(AssetLinkOwner owner) =>
        !string.IsNullOrWhiteSpace(owner.EntityType) && owner.EntityType.Length <= 100 &&
        !string.IsNullOrWhiteSpace(owner.EntityId) && owner.EntityId.Length <= 100 &&
        !string.IsNullOrWhiteSpace(owner.SlotKey) && owner.SlotKey.Length <= 100;

    private static bool MatchesOwner(AssetLink link, AssetLinkOwner owner) =>
        string.Equals(link.OwnerEntityType, owner.EntityType, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(link.OwnerEntityId, owner.EntityId, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(link.SlotKey, owner.SlotKey, StringComparison.OrdinalIgnoreCase);

    private AssetLinkDto ToLinkDto(AssetLink link) => new(
        link.Id, link.AssetId, storageService.GetPublicUrl(link.Asset.StoragePath),
        link.OriginalName, link.Asset.ContentType, link.Asset.SizeBytes,
        link.SortOrder, link.SlotKey, link.CreatedAt, link.Asset.HashSha256);

    public async Task<Result<IReadOnlyList<AssetUploadDto>>> RequestUploadAsync(
        IEnumerable<UploadRequestItemDto> requests,
        CancellationToken ct = default
    )
    {
        var resultList = new List<AssetUploadDto>();
        var requestList = requests.ToList();
        if (requestList.Count == 0)
            return Result.Ok<IReadOnlyList<AssetUploadDto>>(resultList);

        var hashes = requestList.Select(x => x.HashSha256).Distinct().ToList();
        var existingAssets = await dbContext
            .Assets.Where(x => hashes.Contains(x.HashSha256))
            .ToListAsync(ct);

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
                    req.HashSha256
                );
                newAssets.Add(asset);
                existingAssets.Add(asset); // Keep track in case there are duplicates in the request itself
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
            return Result.Ok<IReadOnlyList<ConfirmAssetDto>>(Array.Empty<ConfirmAssetDto>()); // All already confirmed

        var verifyTasks = unconfirmedAssets.Select(async asset =>
        {
            var actualSize = await storageService.GetFileSizeAsync(asset.StoragePath, ct);
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
                storageService.GetPublicUrl(asset.StoragePath)
            ))
            .ToList();

        return Result.Ok<IReadOnlyList<ConfirmAssetDto>>(resultAssets);
    }

    public async Task<Result> VerifyAndLinkAsync(
        IEnumerable<AssetLinkRequestItem> items,
        string ownerEntityType,
        string slotKey,
        string ownerEntityId,
        int startSortOrder = 0,
        CancellationToken ct = default
    )
    {
        var itemList = items.ToList();
        if (itemList.Count == 0)
            return Result.Ok();

        var slotResult = assetRegistry.GetSlotOptions(ownerEntityType, slotKey);
        if (slotResult.IsFailed)
            return slotResult.ToResult();
        var options = slotResult.Value;

        var assetIds = itemList.Select(x => x.AssetId).ToList();
        var assets = await dbContext.Assets.Where(x => assetIds.Contains(x.Id)).ToListAsync(ct);

        var missingIds = assetIds.Except(assets.Select(x => x.Id)).ToList();
        if (missingIds.Count > 0)
            return Result.Fail($"Assets not found: {string.Join(", ", missingIds)}");

        foreach (var asset in assets)
        {
            if (!asset.IsConfirmed)
                return Result.Fail($"Asset '{asset.Id}' has not been confirmed.");

            if (asset.SizeBytes > options.MaxSizeBytes)
                return Result.Fail(
                    $"File size ({asset.SizeBytes} bytes) exceeds the maximum allowed size of {options.MaxSizeBytes} bytes for this slot."
                );

            if (options.AllowedContentTypes != null && options.AllowedContentTypes.Length > 0)
            {
                if (
                    !options.AllowedContentTypes.Contains(
                        asset.ContentType,
                        StringComparer.OrdinalIgnoreCase
                    )
                )
                    return Result.Fail(
                        $"Content type '{asset.ContentType}' is not allowed for this slot."
                    );
            }
        }

        var existingLinks = await dbContext
            .AssetLinks.Where(x =>
                x.OwnerEntityType == ownerEntityType
                && x.OwnerEntityId == ownerEntityId
                && x.SlotKey == slotKey
            )
            .ToListAsync(ct);

        if (!options.AllowMultiple)
        {
            if (itemList.Count > 1)
                return Result.Fail("This slot does not allow multiple files.");
            if (existingLinks.Count > 0)
            {
                dbContext.AssetLinks.RemoveRange(existingLinks);
            }
        }
        else if (
            options.MaxCount.HasValue
            && existingLinks.Count + itemList.Count > options.MaxCount.Value
        )
        {
            return Result.Fail(
                $"Cannot link more than {options.MaxCount.Value} files for this slot. Existing: {existingLinks.Count}, New: {itemList.Count}."
            );
        }

        // After removing existing links above, rebuild from the remaining ones
        var remainingExistingLinks = existingLinks
            .Where(l => !dbContext.Entry(l).State.Equals(EntityState.Deleted))
            .ToList();

        var newLinks = new List<AssetLink>();
        var currentSortOrder = startSortOrder;

        foreach (var item in itemList)
        {
            if (remainingExistingLinks.Any(x => x.AssetId == item.AssetId))
                continue;

            var link = new AssetLink(
                item.AssetId,
                ownerEntityType,
                slotKey,
                ownerEntityId,
                item.OriginalName,
                currentSortOrder++
            );
            newLinks.Add(link);
        }

        if (newLinks.Count > 0)
        {
            dbContext.AssetLinks.AddRange(newLinks);
            await dbContext.SaveChangesAsync(ct);
        }
        else if (existingLinks.Count > 0 && !options.AllowMultiple)
        {
            // Existing links were removed but no new ones added (same asset re-linked)
            await dbContext.SaveChangesAsync(ct);
        }

        return Result.Ok();
    }

    public async Task<Result> RemoveLinkAsync(
        Guid assetId,
        string ownerEntityId,
        CancellationToken ct = default
    )
    {
        var link = await dbContext.AssetLinks.FirstOrDefaultAsync(
            x => x.AssetId == assetId && x.OwnerEntityId == ownerEntityId,
            ct
        );

        if (link == null)
            return Result.Ok(); // idempotent: link already removed or not found

        dbContext.AssetLinks.Remove(link);
        await dbContext.SaveChangesAsync(ct);

        return Result.Ok();
    }

    public async Task<Result> RemoveLinkAsync(
        Guid assetId,
        string ownerEntityId,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    )
    {
        var link = await dbContext.AssetLinks.FirstOrDefaultAsync(
            x =>
                x.AssetId == assetId
                && x.OwnerEntityId == ownerEntityId
                && x.OwnerEntityType == ownerEntityType
                && x.SlotKey == slotKey,
            ct
        );

        if (link == null)
            return Result.Ok();

        dbContext.AssetLinks.Remove(link);
        await dbContext.SaveChangesAsync(ct);

        return Result.Ok();
    }

    public async Task<Result> RemoveLinkAsync(
        string ownerEntityId,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    )
    {
        var links = await dbContext
            .AssetLinks.Where(x =>
                x.OwnerEntityId == ownerEntityId
                && x.OwnerEntityType == ownerEntityType
                && x.SlotKey == slotKey
            )
            .ToListAsync(ct);

        if (links.Count == 0)
            return Result.Ok();

        dbContext.AssetLinks.RemoveRange(links);
        await dbContext.SaveChangesAsync(ct);

        return Result.Ok();
    }

    public async Task<Result<IReadOnlyList<AssetLinkDto>>> GetFilesAsync(
        string ownerEntityId,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    )
    {
        var links = await dbContext
            .AssetLinks.Include(x => x.Asset)
            .Where(x =>
                x.OwnerEntityId == ownerEntityId
                && x.OwnerEntityType == ownerEntityType
                && x.SlotKey == slotKey
            )
            .OrderBy(x => x.SortOrder)
            .Select(x => new AssetLinkDto(
                x.Id,
                x.AssetId,
                storageService.GetPublicUrl(x.Asset.StoragePath),
                x.OriginalName,
                x.Asset.ContentType,
                x.Asset.SizeBytes,
                x.SortOrder,
                x.SlotKey,
                x.CreatedAt,
                x.Asset.HashSha256
            ))
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<AssetLinkDto>>(links);
    }

    public async Task<Result<ILookup<string, AssetLinkDto>>> GetAllFilesForEntityAsync(
        string ownerEntityId,
        string ownerEntityType,
        CancellationToken ct = default
    )
    {
        var links = await dbContext
            .AssetLinks.Include(x => x.Asset)
            .Where(x => x.OwnerEntityId == ownerEntityId && x.OwnerEntityType == ownerEntityType)
            .OrderBy(x => x.SlotKey)
            .ThenBy(x => x.SortOrder)
            .Select(x => new AssetLinkDto(
                x.Id,
                x.AssetId,
                storageService.GetPublicUrl(x.Asset.StoragePath),
                x.OriginalName,
                x.Asset.ContentType,
                x.Asset.SizeBytes,
                x.SortOrder,
                x.SlotKey,
                x.CreatedAt,
                x.Asset.HashSha256
            ))
            .ToListAsync(ct);

        return Result.Ok(links.ToLookup(x => x.SlotKey));
    }

    public async Task<Result<IReadOnlyList<AssetDto>>> GetAssetsByIdsAsync(
        string ownerEntityType,
        string ownerEntityId,
        string slotKey,
        IEnumerable<string> assetIds,
        CancellationToken ct = default
    )
    {
        var assetLinks = await dbContext
            .AssetLinks.Include(x => x.Asset)
            .Where(x =>
                x.OwnerEntityId == ownerEntityId
                && x.OwnerEntityType == ownerEntityType
                && x.SlotKey == slotKey
                && assetIds.Contains(x.AssetId.ToString())
            )
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<AssetDto>>(
            assetLinks
                .Select(x => new AssetDto(
                    x.AssetId,
                    x.OriginalName,
                    x.Asset.ContentType,
                    x.Asset.SizeBytes,
                    storageService.GetPublicUrl(x.Asset.StoragePath)
                ))
                .ToList()
        );
    }

    public async Task<Result<AssetDto>> GetAssetByIdAsync(
        Guid assetId,
        CancellationToken ct = default
    )
    {
        var asset = await dbContext.Assets.AsNoTracking().FirstOrDefaultAsync(x => x.Id == assetId, ct);
        if (asset == null)
            return Result.Fail($"Asset with ID '{assetId}' was not found.");

        return Result.Ok(new AssetDto(
            asset.Id,
            System.IO.Path.GetFileName(asset.StoragePath),
            asset.ContentType,
            asset.SizeBytes,
            storageService.GetPublicUrl(asset.StoragePath)
        ));
    }

    public async Task<Result<IReadOnlyList<AssetDto>>> GetAssetsByIdsAsync(
        IEnumerable<Guid> assetIds,
        CancellationToken ct = default
    )
    {
        var idList = assetIds.Distinct().ToList();
        var assets = await dbContext.Assets.AsNoTracking().Where(x => idList.Contains(x.Id)).ToListAsync(ct);
        return Result.Ok<IReadOnlyList<AssetDto>>(
            assets.Select(asset => new AssetDto(
                asset.Id,
                System.IO.Path.GetFileName(asset.StoragePath),
                asset.ContentType,
                asset.SizeBytes,
                storageService.GetPublicUrl(asset.StoragePath)
            )).ToList()
        );
    }

    public async Task<Result<Dictionary<string, IReadOnlyList<AssetLinkDto>>>> GetFilesAsync(
        IEnumerable<string> ownerEntityIds,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    )
    {
        var assetLinks = await dbContext
            .AssetLinks.Include(x => x.Asset)
            .Where(x =>
                ownerEntityIds.Contains(x.OwnerEntityId)
                && x.OwnerEntityType == ownerEntityType
                && x.SlotKey == slotKey
            )
            .OrderBy(x => x.OwnerEntityId)
            .ThenBy(x => x.SortOrder)
            .ToListAsync(ct);

        var result = new Dictionary<string, IReadOnlyList<AssetLinkDto>>();
        foreach (var link in assetLinks)
        {
            if (!result.ContainsKey(link.OwnerEntityId))
                result[link.OwnerEntityId] = new List<AssetLinkDto>();
            ((List<AssetLinkDto>)result[link.OwnerEntityId]).Add(
                new AssetLinkDto(
                    link.Id,
                    link.AssetId,
                    storageService.GetPublicUrl(link.Asset.StoragePath),
                    link.OriginalName,
                    link.Asset.ContentType,
                    link.Asset.SizeBytes,
                    link.SortOrder,
                    link.SlotKey,
                    link.CreatedAt,
                    link.Asset.HashSha256
                )
            );
        }
        return Result.Ok(result);
    }

    public async Task<Result> UpsertMultipleAsync(
        string ownerEntityType,
        string ownerEntityId,
        string slotKey,
        IEnumerable<AssetUpsertDto> dtos,
        CancellationToken ct = default
    )
    {
        if (dtos == null || !dtos.Any())
            return Result.Ok();

        bool changed = false;

        var existing = await dbContext
            .AssetLinks.Where(x =>
                x.OwnerEntityId == ownerEntityId
                && x.OwnerEntityType == ownerEntityType
                && x.SlotKey == slotKey
            )
            .ToListAsync(ct);

        var assets = existing.Select(al => (al.AssetId, al.OriginalName)).ToHashSet();

        var options = assetRegistry.GetSlotOptions(ownerEntityType, slotKey);

        if (options == null || !options.Value.AllowMultiple)
        {
            return Result.Fail("This slot does not allow multiple files.");
        }

        var toAdd = dtos.Where(x => !assets.Contains((x.AssetId, x.Name))).ToList();

        var toRemove = existing.Where(x => !assets.Contains((x.AssetId, x.OriginalName))).ToList();

        if (toAdd.Count > 0)
        {
            var lastSortOrder = existing.Any() ? existing.Max(x => x.SortOrder) + 1 : 1;
            var newLinks = toAdd
                .Select(
                    (dto, idx) =>
                        new AssetLink(
                            dto.AssetId,
                            ownerEntityType,
                            slotKey,
                            ownerEntityId,
                            dto.Name,
                            lastSortOrder + idx
                        )
                )
                .ToList();
            dbContext.AssetLinks.AddRange(newLinks);

            changed = true;
        }

        if (toRemove.Count > 0)
        {
            dbContext.AssetLinks.RemoveRange(toRemove);
            changed = true;
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(ct);
        }

        return Result.Ok();
    }
}
