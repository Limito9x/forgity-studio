using FluentResults;

namespace Automation.Content.Contracts;

public interface IContentApi
{
    Task<Result<IReadOnlyDictionary<Guid, ContentSummaryDto>>> GetContentsByProjectIdAsync(
        Guid projectId,
        CancellationToken ct = default
    );

    Task<Result<ContentSummaryDto>> GetContentByIdAsync(
        Guid contentId,
        CancellationToken ct = default
    );

    Task<Result<IReadOnlyDictionary<Guid, ContentSummaryDto>>> GetContentsByIdsAsync(
        IEnumerable<Guid> contentIds,
        CancellationToken ct = default
    );

    Task<Result<ContentSummaryDto>> GetOrCreateContentItemAsync(
        Guid projectId,
        string contentTypeKeyOrName,
        string contentItemName,
        bool createIfNotExists,
        CancellationToken ct = default
    );

    /// <summary>
    /// Smart-links resources by convention (token splitting on '_'):
    /// Automatically resolves or creates ContentItem from Token[0] + ContentType,
    /// and binds the resource to AnchorPath (Tokens[1..]).
    /// </summary>
    Task<Result<IReadOnlyList<ContentAnchorLinkDto>>> SmartLinkResourcesByConventionAsync(
        Guid projectId,
        string contentTypeKeyOrName,
        IEnumerable<ResourceSmartLinkInput> resources,
        CancellationToken ct = default
    );

    /// <summary>
    /// Explicitly binds resources to a specific ContentItem and AnchorPath.
    /// </summary>
    Task<Result<IReadOnlyList<ContentAnchorLinkDto>>> AssignResourcesToAnchorAsync(
        Guid projectId,
        Guid contentItemId,
        string? anchorPath,
        IEnumerable<ResourceSmartLinkInput> resources,
        CancellationToken ct = default
    );

    /// <summary>
    /// Removes anchor links for the given resource IDs (optionally scoped to a contentItemId).
    /// </summary>
    Task<Result> UnlinkResourcesAsync(
        IEnumerable<Guid> resourceIds,
        Guid? contentItemId = null,
        CancellationToken ct = default
    );

    /// <summary>
    /// Gets all active anchor links for a set of resource IDs (for reverse lookup / badge rendering).
    /// Returns dictionary mapping ResourceId to list of anchor links.
    /// </summary>
    Task<Result<IReadOnlyDictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>>> GetResourceAnchorLinksAsync(
        IEnumerable<Guid> resourceIds,
        CancellationToken ct = default
    );

    /// <summary>
    /// Gets the hierarchical virtual tree of anchor links for a ContentItem.
    /// </summary>
    Task<Result<ContentAnchorTreeDto>> GetContentAnchorTreeAsync(
        Guid contentItemId,
        CancellationToken ct = default
    );

    /// <summary>
    /// Gets all Resource IDs anchored to a specific ContentItem.
    /// </summary>
    Task<Result<IReadOnlyList<Guid>>> GetLinkedResourceIdsByContentIdAsync(
        Guid contentItemId,
        CancellationToken ct = default
    );

    /// <summary>
    /// Gets all unique Resource IDs anchored to any ContentItem within a project.
    /// Useful for finding assigned vs unassigned (orphan) resources.
    /// </summary>
    Task<Result<IReadOnlyList<Guid>>> GetAllLinkedResourceIdsInProjectAsync(
        Guid projectId,
        CancellationToken ct = default
    );
}
