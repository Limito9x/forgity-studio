using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Automation.Repository.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.EntityStore;

/// <summary>
/// Triển khai Identity Map cho Execution Session.
/// Cache dữ liệu Entity dưới dạng In-Memory Dictionary theo (EntityType, Id).
/// </summary>
public class ExecutionEntityStore(
    IRepositoryApi repositoryApi,
    ILogger<ExecutionEntityStore> logger
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

            foreach (var item in result.Value)
            {
                var relPath = item.RelativePath ?? string.Empty;
                var fileName = Path.GetFileName(relPath);
                var baseName = Path.GetFileNameWithoutExtension(relPath);
                var extension = item.Extension ?? Path.GetExtension(relPath).TrimStart('.').ToLowerInvariant();

                var props = new Dictionary<string, object?>
                {
                    ["ResourceId"] = item.ResourceId,
                    ["ResourceVersionId"] = item.ResourceVersionId,
                    ["DisplayName"] = item.DisplayName,
                    ["FileName"] = fileName,
                    ["BaseName"] = baseName,
                    ["Extension"] = extension,
                    ["RelativePath"] = relPath,
                    ["FileHash"] = item.FileHash ?? string.Empty,
                    ["ContentId"] = item.ContentId?.ToString() ?? string.Empty,
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
