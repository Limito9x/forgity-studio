using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using FluentResults;
using Microsoft.EntityFrameworkCore;

namespace Automation.Files.Infrastructure;

public partial class AssetApiService
{
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
                storageFactory.GetPublicUrl(x.Asset.StorageProfileId, x.Asset.StoragePath),
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
                storageFactory.GetPublicUrl(x.Asset.StorageProfileId, x.Asset.StoragePath),
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
                    storageFactory.GetPublicUrl(x.Asset.StorageProfileId, x.Asset.StoragePath)
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
            storageFactory.GetPublicUrl(asset.StorageProfileId, asset.StoragePath)
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
                storageFactory.GetPublicUrl(asset.StorageProfileId, asset.StoragePath)
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
                    storageFactory.GetPublicUrl(link.Asset.StorageProfileId, link.Asset.StoragePath),
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
}
