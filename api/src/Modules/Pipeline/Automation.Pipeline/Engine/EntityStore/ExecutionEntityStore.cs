using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Automation.Content.Contracts;
using Automation.Repository.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.EntityStore;

/// <summary>
/// Triển khai Identity Map cho Execution Session.
/// Cache dữ liệu Entity dưới dạng In-Memory Dictionary theo (EntityType, Id).
/// </summary>
public class ExecutionEntityStore(
    IRepositoryApi repositoryApi,
    ILogger<ExecutionEntityStore> logger,
    IContentApi? contentApi = null
) : IExecutionEntityStore
{
    private readonly ConcurrentDictionary<(string EntityType, Guid Id), Dictionary<string, object?>> _store = new();

    public Dictionary<string, object?>? GetProperties(string entityType, Guid id)
    {
        if (id == Guid.Empty || string.IsNullOrWhiteSpace(entityType))
        {
            return null;
        }

        return _store.TryGetValue((entityType.ToLowerInvariant(), id), out var props) ? props : null;
    }

    public void SetProperties(string entityType, Guid id, Dictionary<string, object?> properties)
    {
        if (id == Guid.Empty || string.IsNullOrWhiteSpace(entityType))
        {
            return;
        }

        _store[(entityType.ToLowerInvariant(), id)] = properties;
    }

    public async Task PrefetchResourcesAsync(IEnumerable<Guid> resourceIds, CancellationToken ct = default)
    {
        var rawIds = resourceIds.Where(id => id != Guid.Empty).Distinct().ToList();
        if (rawIds.Count == 0)
        {
            return;
        }

        // Lọc các ID chưa có trong cache
        var missingIds = rawIds
            .Where(id => !_store.ContainsKey(("resource", id)))
            .ToList();

        if (missingIds.Count == 0)
        {
            logger.LogDebug("ExecutionEntityStore: All {Count} resources already pre-fetched in memory.", rawIds.Count);
            return;
        }

        logger.LogInformation("ExecutionEntityStore: Batch prefetching {Count} resources from database...", missingIds.Count);

        try
        {
            var result = await repositoryApi.GetResourcesByIdsAsync(missingIds, ct);
            if (result.IsFailed || result.Value == null)
            {
                logger.LogWarning("ExecutionEntityStore: Failed to batch fetch resources: {Errors}",
                    string.Join("; ", result.Errors.Select(e => e.Message)));
                return;
            }

            // Batch fetch assigned contents if any
            var contentIds = result.Value
                .Where(r => r.ContentId.HasValue && r.ContentId.Value != Guid.Empty)
                .Select(r => r.ContentId!.Value)
                .Distinct()
                .ToList();

            IReadOnlyDictionary<Guid, ContentSummaryDto> contentMap = new Dictionary<Guid, ContentSummaryDto>();
            if (contentApi != null && contentIds.Count > 0)
            {
                var contentRes = await contentApi.GetContentsByIdsAsync(contentIds, ct);
                if (contentRes.IsSuccess && contentRes.Value != null)
                {
                    contentMap = contentRes.Value;
                }
            }

            foreach (var item in result.Value)
            {
                var relPath = item.RelativePath ?? string.Empty;
                var fileName = Path.GetFileName(relPath);
                var baseName = Path.GetFileNameWithoutExtension(relPath);
                var extension = item.Extension ?? Path.GetExtension(relPath).TrimStart('.').ToLowerInvariant();

                var contentName = baseName;
                var contentType = string.Empty;
                if (item.ContentId.HasValue && contentMap.TryGetValue(item.ContentId.Value, out var cSummary))
                {
                    contentName = cSummary.Name;
                    contentType = cSummary.ContentTypeName ?? string.Empty;
                }

                var props = new Dictionary<string, object?>
                {
                    ["ResourceId"] = item.ResourceId,
                    ["ResourceVersionId"] = item.ResourceVersionId,
                    ["RepositoryId"] = item.RepositoryId != Guid.Empty ? item.RepositoryId : null,
                    ["Repository"] = item.RepositoryId != Guid.Empty ? item.RepositoryId : null,
                    ["DisplayName"] = item.DisplayName,
                    ["FileName"] = fileName,
                    ["BaseName"] = baseName,
                    ["Extension"] = extension,
                    ["RelativePath"] = relPath,
                    ["FileHash"] = item.FileHash ?? string.Empty,
                    ["ContentId"] = item.ContentId?.ToString() ?? string.Empty,
                    ["ContentName"] = contentName,
                    ["ContentType"] = contentType,
                    ["Metadata"] = item.MetadataJson ?? string.Empty
                };

                // Lưu kép cả ResourceId lẫn ResourceVersionId để BreakStruct bốc trúng bất kể dùng ID nào
                _store[("resource", item.ResourceId)] = props;
                if (item.ResourceVersionId != Guid.Empty)
                {
                    _store[("resource", item.ResourceVersionId)] = props;
                }
            }

            logger.LogInformation("ExecutionEntityStore: Successfully pre-fetched and cached {Count} resources.", result.Value.Count);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ExecutionEntityStore: Exception occurred during batch prefetch of resources.");
        }
    }
}
