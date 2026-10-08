using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Tools.Workspaces;

/// <summary>
/// Tool batch cập nhật metadata cho nhiều ResourceVersion cùng lúc thông qua Map (Key: Resource ID / File Path -> Value: Metadata).
/// </summary>
public class UpdateResourceMetadataTool(
    IRepositoryApi workspaceApi,
    Engine.EntityStore.IExecutionEntityStore? entityStore = null
) : IResolverTool
{
    public string Key => "UpdateResourceMetadata";
    public string Label => "Update Resource Metadata";
    public string? Category => "Workspace & Files";
    public string? Description => "Batch updates metadata for resources using a Map of Resource Version IDs or File Paths -> Metadata.";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "MetadataMap",
            Label = "Metadata Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = true,
            Metadata = """{"description": "Map of Resource IDs, URNs, or File Paths to their metadata JSON/objects"}"""
        },
        new()
        {
            Id = "Repository",
            Label = "Repository",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "Workspace",
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            Metadata = """{"type": "entity-select", "properties": {"entity": "Workspace"}}"""
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Success",
            Label = "Success",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        },
        new()
        {
            Id = "UpdatedCount",
            Label = "Updated Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        // 1. Resolve MetadataMap
        object? rawMap = null;
        foreach (var (k, v) in inputs)
        {
            var norm = k.Replace(" ", "").Replace("_", "").Replace("-", "");
            if (string.Equals(norm, "MetadataMap", StringComparison.OrdinalIgnoreCase))
            {
                rawMap = v;
                break;
            }
        }
        rawMap ??= inputs.GetValueOrDefault("MetadataMap") ?? inputs.GetValueOrDefault("metadata_map");

        // Fallback: If any input is a dictionary or JSON object
        if (rawMap == null)
        {
            foreach (var (k, v) in inputs)
            {
                if (string.Equals(k, "Repository", StringComparison.OrdinalIgnoreCase)) continue;
                if (v is IDictionary || v is JsonElement { ValueKind: JsonValueKind.Object })
                {
                    rawMap = v;
                    break;
                }
            }
        }

        var metadataMap = ExtractMap(rawMap);
        if (metadataMap.Count == 0)
        {
            throw new ArgumentException("MetadataMap is required and cannot be empty for UpdateResourceMetadataTool.");
        }

        // 2. Resolve optional Repository ID for path resolution
        Guid? repoId = null;
        var rawRepo = inputs.GetValueOrDefault("Repository") ?? inputs.GetValueOrDefault("Workspace");
        if (rawRepo != null)
        {
            var (_, parsedRepoId, isRepoValid) = EntityRefHelper.Parse(rawRepo);
            if (isRepoValid && parsedRepoId != Guid.Empty)
            {
                repoId = parsedRepoId;
            }
        }

        // 3. Pre-resolve path keys if repoId is available
        var pathKeys = new List<string>();
        foreach (var key in metadataMap.Keys)
        {
            if (TryExtractGuid(key) == null)
            {
                pathKeys.Add(key);
            }
        }

        Dictionary<string, Guid>? resolvedPaths = null;
        if (pathKeys.Count > 0 && repoId.HasValue)
        {
            var resolveRes = await workspaceApi.ResolveResourceVersionIdsByPathsAsync(repoId.Value, pathKeys, ct);
            if (resolveRes.IsSuccess)
            {
                resolvedPaths = resolveRes.Value;
            }
        }

        // 4. Update each entry
        var updatedCount = 0;
        foreach (var (resourceKey, metaVal) in metadataMap)
        {
            var targetGuid = TryExtractGuid(resourceKey);

            if (targetGuid == null && resolvedPaths != null && resolvedPaths.TryGetValue(resourceKey, out var pGuid))
            {
                targetGuid = pGuid;
            }

            if (targetGuid == null || targetGuid == Guid.Empty)
            {
                throw new ArgumentException(
                    $"Unable to resolve Resource Version for key '{resourceKey}'. Expected a GUID, EntityRef (e.g. 'urn:resource:...'), or a valid file path matching a repository resource.");
            }

            var versionId = targetGuid.Value;
            var locResult = await workspaceApi.GetResourceLocationAsync(targetGuid.Value, ct);
            if (locResult.IsSuccess)
            {
                versionId = locResult.Value.ResourceVersionId;
            }

            var jsonDoc = ParseToJsonDocument(metaVal, resourceKey);
            var updateResult = await workspaceApi.UpdateMetadataAsync(versionId, jsonDoc, ct);
            if (updateResult.IsFailed)
            {
                throw new InvalidOperationException(
                    $"Failed to update metadata for ResourceVersion '{versionId}': {string.Join(", ", updateResult.Errors.Select(e => e.Message))}");
            }

            // Sync updated metadata into ExecutionEntityStore (Identity Map sync)
            if (entityStore != null)
            {
                var existingProps = entityStore.GetProperties("Resource", targetGuid.Value)
                                    ?? entityStore.GetProperties("Resource", versionId);
                if (existingProps != null)
                {
                    existingProps["Metadata"] = jsonDoc?.RootElement.GetRawText() ?? string.Empty;
                    entityStore.SetProperties("Resource", targetGuid.Value, existingProps);
                    if (versionId != targetGuid.Value)
                    {
                        entityStore.SetProperties("Resource", versionId, existingProps);
                    }
                }
            }

            updatedCount++;
        }

        return new Dictionary<string, object>
        {
            ["Success"] = true,
            ["UpdatedCount"] = updatedCount
        };
    }

    private static Guid? TryExtractGuid(string key)
    {
        var targetGuid = EntityRefHelper.ExtractRefId(key);
        if (targetGuid != null && targetGuid != Guid.Empty) return targetGuid;

        var cleanKey = key.Trim();
        var lastColon = cleanKey.LastIndexOf(':');
        var candidate = lastColon >= 0 ? cleanKey[(lastColon + 1)..].Trim() : cleanKey;
        if (Guid.TryParse(candidate, out var parsedGuid) && parsedGuid != Guid.Empty)
        {
            return parsedGuid;
        }

        return null;
    }

    private static Dictionary<string, object?> ExtractMap(object? source)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (source == null) return result;

        if (source is IDictionary dict)
        {
            foreach (DictionaryEntry entry in dict)
            {
                if (entry.Key != null)
                {
                    result[entry.Key.ToString()!] = entry.Value;
                }
            }
            return result;
        }

        if (source is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in jsonElem.EnumerateObject())
            {
                result[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Number => prop.Value.TryGetInt64(out var l) ? l : prop.Value.GetDouble(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Null => null,
                    _ => prop.Value.Clone()
                };
            }
            return result;
        }

        if (source is string jsonStr && jsonStr.TrimStart().StartsWith('{'))
        {
            try
            {
                using var doc = JsonDocument.Parse(jsonStr);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    return ExtractMap(doc.RootElement);
                }
            }
            catch
            {
                // ignored
            }
        }

        return result;
    }

    private static JsonDocument ParseToJsonDocument(object? metaVal, string debugKey)
    {
        if (metaVal == null)
        {
            return JsonDocument.Parse("{}");
        }

        if (metaVal is JsonDocument jDoc)
        {
            if (jDoc.RootElement.ValueKind == JsonValueKind.String)
            {
                var s = jDoc.RootElement.GetString();
                if (!string.IsNullOrWhiteSpace(s) && (s.TrimStart().StartsWith('{') || s.TrimStart().StartsWith('[')))
                {
                    try { return JsonDocument.Parse(s); } catch { }
                }
            }
            return jDoc;
        }

        if (metaVal is JsonElement jElem)
        {
            if (jElem.ValueKind == JsonValueKind.String)
            {
                var s = jElem.GetString();
                if (!string.IsNullOrWhiteSpace(s) && (s.TrimStart().StartsWith('{') || s.TrimStart().StartsWith('[')))
                {
                    try { return JsonDocument.Parse(s); } catch { }
                }
            }
            return JsonDocument.Parse(jElem.GetRawText());
        }

        if (metaVal is string str)
        {
            var trimmed = str.Trim();
            if (trimmed.StartsWith('{') || trimmed.StartsWith('['))
            {
                try
                {
                    return JsonDocument.Parse(trimmed);
                }
                catch (JsonException ex)
                {
                    throw new ArgumentException($"Invalid JSON in Metadata for '{debugKey}': {ex.Message}");
                }
            }

            var wrapped = JsonSerializer.Serialize(new { raw_text = str });
            return JsonDocument.Parse(wrapped);
        }

        var serialized = JsonSerializer.Serialize(metaVal);
        return JsonDocument.Parse(serialized);
    }
}
