using FluentResults;

namespace Automation.Files.Contracts;

public interface IAssetApi
{
    // Prepare references without deleting old links. Caller authorizes each owner.
    // Matching owner/slot + asset/name reuses a link, including repeated batch items.
    // Validation errors are per item; database/cancellation failures throw.
    // Retry reuse is sequential; concurrent calls are not serialized by this API.
    Task<IReadOnlyList<AssetLinkSyncResult>> SyncLinksAsync(
        IEnumerable<AssetLinkSyncItem> items,
        CancellationToken ct = default);

    // Files validates the asset and replaces the slot using its own context.
    Task<Result<AssetLinkDto>> ReplaceSingleLinkAsync(
        AssetLinkRequestItem item, AssetLinkOwner owner,
        string? expectedHash = null, CancellationToken ct = default);

    // These are internal APIs: the caller must authorize access to the owner.
    // Create never replaces an existing link. Remove the old PK after saving its replacement.
    Task<Result<AssetLinkDto>> CreateLinkAsync(
        AssetLinkRequestItem item,
        AssetLinkOwner owner,
        int sortOrder = 0,
        CancellationToken ct = default
    );

    // Every requested PK must exist and match its expected owner and slot.
    Task<Result<IReadOnlyList<AssetLinkDto>>> GetLinksByIdsAsync(
        IEnumerable<AssetLinkReference> references,
        CancellationToken ct = default
    );

    // For display hydration: return only confirmed links matching each expected owner.
    // Missing/mismatched references are omitted so one broken pin does not hide other names.
    Task<Result<IReadOnlyList<AssetLinkDto>>> FindLinksByIdsAsync(
        IEnumerable<AssetLinkReference> references,
        CancellationToken ct = default
    );

    // Resolves an existing link by ID. If it matches targetOwner, reuses it;
    // if it exists but belongs to a different owner (e.g. imported package, cloned node),
    // automatically clones a new link for targetOwner pointing to the same asset.
    Task<Result<AssetLinkDto>> ResolveOrCloneLinkAsync(
        Guid assetLinkId,
        AssetLinkOwner targetOwner,
        CancellationToken ct = default
    );

    // Missing PK is idempotent; an existing PK with another owner/slot is rejected.
    Task<Result> RemoveLinkByIdAsync(
        AssetLinkReference reference,
        CancellationToken ct = default
    );

    // Request Upload Multiple
    Task<Result<IReadOnlyList<AssetUploadDto>>> RequestUploadAsync(
        IEnumerable<UploadRequestItemDto> requests,
        CancellationToken ct = default
    );

    // Confirm Upload Multiple
    Task<Result<IReadOnlyList<ConfirmAssetDto>>> ConfirmUploadAsync(
        IEnumerable<Guid> assetIds,
        CancellationToken ct = default
    );

    // Verify And Link Multiple
    Task<Result> VerifyAndLinkAsync(
        IEnumerable<AssetLinkRequestItem> items,
        string ownerEntityType,
        string slotKey,
        string ownerEntityId,
        int startSortOrder = 0,
        CancellationToken ct = default
    );

    // Overload cho 1 file
    async Task<Result> VerifyAndLinkAsync(
        Guid assetId,
        string ownerEntityType,
        string slotKey,
        string ownerEntityId,
        string originalName,
        int sortOrder = 0,
        CancellationToken ct = default
    ) =>
        await VerifyAndLinkAsync(
            new[] { new AssetLinkRequestItem(assetId, originalName) },
            ownerEntityType,
            slotKey,
            ownerEntityId,
            sortOrder,
            ct
        );

    // Xóa link theo Asset ID và Owner Entity ID
    Task<Result> RemoveLinkAsync(
        Guid assetId,
        string ownerEntityId,
        CancellationToken ct = default
    );

    // Xóa link cụ thể theo Asset ID, Slot Key và Owner Entity
    Task<Result> RemoveLinkAsync(
        Guid assetId,
        string ownerEntityId,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    );

    // Xóa tất cả link trong 1 Slot của Owner Entity (clear slot)
    Task<Result> RemoveLinkAsync(
        string ownerEntityId,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    );

    // Query file theo slot
    Task<Result<IReadOnlyList<AssetLinkDto>>> GetFilesAsync(
        string ownerEntityId,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    );

    // Query toàn bộ file của một Entity
    Task<Result<ILookup<string, AssetLinkDto>>> GetAllFilesForEntityAsync(
        string ownerEntityId,
        string ownerEntityType,
        CancellationToken ct = default
    );

    // Query file theo Asset IDs
    Task<Result<IReadOnlyList<AssetDto>>> GetAssetsByIdsAsync(
        string ownerEntityType,
        string ownerEntityId,
        string slotKey,
        IEnumerable<string> assetIds,
        CancellationToken ct = default
    );

    // Query asset trực tiếp theo Asset ID độc lập
    Task<Result<AssetDto>> GetAssetByIdAsync(
        Guid assetId,
        CancellationToken ct = default
    );

    Task<Result<IReadOnlyList<AssetDto>>> GetAssetsByIdsAsync(
        IEnumerable<Guid> assetIds,
        CancellationToken ct = default
    );

    // Query trả về dictionary với cùng entity nhưng nhiều id
    Task<Result<Dictionary<string, IReadOnlyList<AssetLinkDto>>>> GetFilesAsync(
        IEnumerable<string> ownerEntityIds,
        string ownerEntityType,
        string slotKey,
        CancellationToken ct = default
    );

    // Upsert nhiều file theo slot
    Task<Result> UpsertMultipleAsync(
        string ownerEntityType,
        string ownerEntityId,
        string slotKey,
        IEnumerable<AssetUpsertDto> dtos,
        CancellationToken ct = default
    );
}
