using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Automation.SystemAbstractions;
using FluentResults;
using Wolverine;

namespace Automation.Files.Infrastructure;

/// <summary>
/// Service chính điều phối toàn bộ vòng đời của Files module.
/// Được cấu trúc dạng partial class theo từng nhóm nghiệp vụ:
/// - AssetApiService.Links.cs: Quản lý liên kết, sync, thay thế, clone và verify pins.
/// - AssetApiService.Uploads.cs: Quản lý yêu cầu presigned URL, quota và confirm upload.
/// - AssetApiService.Queries.cs: Tra cứu asset, tìm kiếm links và hydration.
/// - AssetApiService.Migration.cs: Piped streaming multipart và di chuyển dữ liệu giữa các Storage Profiles.
/// </summary>
public partial class AssetApiService(
    FilesDbContext dbContext,
    IStorageServiceFactory storageFactory,
    AssetRegistry assetRegistry,
    IMessageBus? bus = null
) : IAssetApi
{
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
    );

    private async Task<long> GetStudioCloudDefaultQuotaBytesAsync(CancellationToken ct)
    {
        if (bus != null)
        {
            try
            {
                var settingResult = await bus.InvokeAsync<Result<string>>(new GetSystemSettingByKeyQuery("Storage:StudioCloudDefaultQuotaMb"), ct);
                if (settingResult.IsSuccess && long.TryParse(settingResult.Value, out var quotaMb) && quotaMb > 0)
                {
                    return quotaMb * 1024 * 1024;
                }
            }
            catch
            {
                // Fallback default
            }
        }
        return 200L * 1024 * 1024;
    }
}
