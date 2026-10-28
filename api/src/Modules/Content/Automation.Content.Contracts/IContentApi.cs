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
}
