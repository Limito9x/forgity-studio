namespace Automation.Files.Contracts;

/// <summary>
/// Prepare a file reference for an authorized owner. Supply File for an upload or
/// AssetLinkId to retain a reference. Neither means clear; preparation never unlinks.
/// </summary>
public record AssetLinkSyncItem(
    AssetLinkOwner Owner,
    AssetLinkRequestItem? File = null,
    Guid? AssetLinkId = null);

/// <summary>One result per input, in input order. A successful clear has no Link.</summary>
public record AssetLinkSyncResult(
    AssetLinkOwner Owner,
    AssetLinkDto? Link,
    string? ErrorCode = null,
    string? ErrorMessage = null)
{
    public bool IsSuccess => ErrorCode is null;
}
