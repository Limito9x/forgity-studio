using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.State.EntityStore;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Contracts.Tools.Workspaces;

/// <summary>
/// Tool batch cập nhật metadata và thumbnail riêng biệt cho nhiều ResourceVersion cùng lúc thông qua Maps.
/// </summary>
public class UpdateResourceMetadataTool(
    IRepositoryApi workspaceApi,
    IExecutionEntityStore? entityStore = null
) : IResolverTool
{
    public string Key => "UpdateResourceMetadata";
    public string Label => "Update Resources";
    public string? Category => "Workspaces & Resources";
    public string? Description => "Batch updates metadata and thumbnails for resources using Maps of Resource IDs or File Paths.";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "MetadataMap",
            Label = "Metadata Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = false,
            Description = "Map of Resource IDs, URNs, or File Paths to their metadata JSON string or dictionary",
            SampleJson = "{\n  \"characters/hero.fbx\": {\n    \"triangles\": 14200,\n    \"rig\": \"Humanoid\"\n  }\n}"
        },
        new()
        {
            Id = "ThumbnailMap",
            Label = "Thumbnail Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = false,
            Description = "Map of Resource IDs, URNs, or File Paths to their thumbnail image paths (.png)",
            SampleJson = "{\n  \"characters/hero.fbx\": \"characters/hero_thumb.png\"\n}"
        },
        new()
        {
            Id = "Workstation",
            Label = "Workstation",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Workstation,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            Description = "Target workstation to resolve root path and repository reference"
        },
        new()
        {
            Id = "Repository",
            Label = "Repository",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Repository,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            Description = "Optional target repository reference if resolving by relative paths"
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

        // 1. Resolve MetadataMap and ThumbnailMap independently
        object? rawMetadataMap = inputs.GetValueOrDefault("MetadataMap") ?? inputs.GetValueOrDefault("metadata_map");
        object? rawThumbnailMap = inputs.GetValueOrDefault("ThumbnailMap") ?? inputs.GetValueOrDefault("thumbnail_map") ?? inputs.GetValueOrDefault("thumbnails");

        if (rawMetadataMap == null && rawThumbnailMap == null)
        {
            foreach (var (k, v) in inputs)
            {
                var norm = k.Replace(" ", "").Replace("_", "").Replace("-", "");
                if (string.Equals(norm, "MetadataMap", StringComparison.OrdinalIgnoreCase))
                {
                    rawMetadataMap = v;
                }
                else if (string.Equals(norm, "ThumbnailMap", StringComparison.OrdinalIgnoreCase))
                {
                    rawThumbnailMap = v;
                }
            }
        }

        if (rawMetadataMap == null && rawThumbnailMap == null)
        {
            foreach (var (k, v) in inputs)
            {
                if (string.Equals(k, "Repository", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(k, "Workstation", StringComparison.OrdinalIgnoreCase)) continue;
                if (v is IDictionary || v is JsonElement { ValueKind: JsonValueKind.Object })
                {
                    rawMetadataMap = v;
                    break;
                }
            }
        }

        var metadataMap = ExtractMap(rawMetadataMap);
        var thumbnailMap = ExtractMap(rawThumbnailMap);

        if (metadataMap.Count == 0 && thumbnailMap.Count == 0)
        {
            throw new ArgumentException("At least one of MetadataMap or ThumbnailMap must be provided and not empty for UpdateResourceMetadataTool.");
        }

        var allKeys = metadataMap.Keys.Concat(thumbnailMap.Keys).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        // 2. Resolve Workstation and Repository ID for path resolution
        Guid? repoId = null;
        string? rootPath = null;

        var rawWs = inputs.GetValueOrDefault("Workstation") ?? inputs.GetValueOrDefault("WorkstationId");
        if (rawWs != null)
        {
            var (_, wsId, isWsValid) = EntityRefHelper.Parse(rawWs);
            if (isWsValid && wsId != Guid.Empty)
            {
                var wsResult = await workspaceApi.GetWorkstationByIdAsync(wsId, ct);
                if (wsResult.IsSuccess && wsResult.Value != null)
                {
                    repoId = wsResult.Value.RepositoryId;
                    rootPath = wsResult.Value.RootPath;
                }
            }
        }

        if (!repoId.HasValue)
        {
            var rawRepo = inputs.GetValueOrDefault("Repository") ?? inputs.GetValueOrDefault("Workspace");
            if (rawRepo != null)
            {
                var (_, parsedRepoId, isRepoValid) = EntityRefHelper.Parse(rawRepo);
                if (isRepoValid && parsedRepoId != Guid.Empty)
                {
                    repoId = parsedRepoId;
                }
            }
        }

        // 3. Pre-resolve path keys if repoId is available
        var pathKeys = new List<string>();
        var keyToCleanPathMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var key in allKeys)
        {
            if (TryExtractGuid(key) == null)
            {
                var cleanPath = NormalizePathKey(key, rootPath);
                pathKeys.Add(cleanPath);
                keyToCleanPathMap[key] = cleanPath;
            }
        }

        Dictionary<string, Guid>? resolvedPaths = null;
        if (pathKeys.Count > 0 && repoId.HasValue)
        {
            var resolveRes = await workspaceApi.ResolveResourceVersionIdsByPathsAsync(
                repoId.Value,
                pathKeys.Distinct(StringComparer.OrdinalIgnoreCase),
                ct
            );
            if (resolveRes.IsSuccess)
            {
                resolvedPaths = resolveRes.Value;
            }
        }

        // 4. Update Metadata and Thumbnail independently per resource
        var updatedCount = 0;
        foreach (var resourceKey in allKeys)
        {
            var targetGuid = TryExtractGuid(resourceKey);

            if (targetGuid == null && resolvedPaths != null)
            {
                var cleanPath = keyToCleanPathMap.GetValueOrDefault(resourceKey) ?? resourceKey;
                if (resolvedPaths.TryGetValue(cleanPath, out var pGuid) || resolvedPaths.TryGetValue(resourceKey, out pGuid))
                {
                    targetGuid = pGuid;
                }
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

            // 4.1. Update Metadata (if present in MetadataMap)
            if (metadataMap.TryGetValue(resourceKey, out var metaVal) && metaVal != null)
            {
                var jsonDoc = ParseToJsonDocument(metaVal, resourceKey);
                var updateResult = await workspaceApi.UpdateMetadataAsync(versionId, jsonDoc, ct);
                if (updateResult.IsFailed)
                {
                    throw new InvalidOperationException(
                        $"Failed to update metadata for ResourceVersion '{versionId}': {string.Join(", ", updateResult.Errors.Select(e => e.Message))}");
                }

                // Sync updated metadata into ExecutionEntityStore
                if (entityStore != null)
                {
                    var existingProps = entityStore.GetProperties("Resource", targetGuid.Value)
                                        ?? entityStore.GetProperties("Resource", versionId);
                    if (existingProps != null)
                    {
                        existingProps["Metadata"] = jsonDoc.RootElement.GetRawText();
                        entityStore.SetProperties("Resource", targetGuid.Value, existingProps);
                        if (versionId != targetGuid.Value)
                        {
                            entityStore.SetProperties("Resource", versionId, existingProps);
                        }
                    }
                }
            }

            // 4.2. Update Thumbnail via Files API AssetSlot (if present in ThumbnailMap)
            if (thumbnailMap.TryGetValue(resourceKey, out var thumbVal) && thumbVal != null)
            {
                var thumbPath = thumbVal.ToString()?.Trim();
                if (!string.IsNullOrEmpty(thumbPath))
                {
                    var thumbResult = await workspaceApi.UpdateThumbnailAsync(versionId, thumbPath, ct);
                    if (thumbResult.IsFailed)
                    {
                        throw new InvalidOperationException(
                            $"Failed to update thumbnail for ResourceVersion '{versionId}': {string.Join(", ", thumbResult.Errors.Select(e => e.Message))}");
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

    private static string NormalizePathKey(string key, string? rootPath)
    {
        var k = key.Trim().Replace('\\', '/');
        if (!string.IsNullOrWhiteSpace(rootPath))
        {
            var cleanRoot = rootPath.Trim().Replace('\\', '/').TrimEnd('/');
            if (k.StartsWith(cleanRoot, StringComparison.OrdinalIgnoreCase))
            {
                k = k.Substring(cleanRoot.Length);
            }
            else if (Path.IsPathRooted(k) || (k.Length > 2 && k[1] == ':'))
            {
                try
                {
                    k = Path.GetRelativePath(cleanRoot, k).Replace('\\', '/');
                }
                catch
                {
                    // Fallback
                }
            }
        }
        return k.TrimStart('/');
    }

    private static Dictionary<string, object?> ExtractMap(object? raw)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (raw == null) return result;

        if (raw is IDictionary dict)
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

        if (raw is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in jsonElem.EnumerateObject())
            {
                result[prop.Name] = prop.Value;
            }
            return result;
        }

        if (raw is string str && !string.IsNullOrWhiteSpace(str))
        {
            try
            {
                using var doc = JsonDocument.Parse(str);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        result[prop.Name] = prop.Value.Clone();
                    }
                }
            }
            catch
            {
                // Not valid JSON object
            }
        }

        return result;
    }

    private static Guid? TryExtractGuid(string key)
    {
        if (Guid.TryParse(key, out var guid))
        {
            return guid;
        }

        var (_, parsedId, isValid) = EntityRefHelper.Parse(key);
        if (isValid && parsedId != Guid.Empty)
        {
            return parsedId;
        }

        return null;
    }

    private static JsonDocument ParseToJsonDocument(object? metaVal, string resourceKey)
    {
        if (metaVal == null)
        {
            return JsonDocument.Parse("{}");
        }

        if (metaVal is JsonDocument doc)
        {
            return doc;
        }

        if (metaVal is JsonElement elem)
        {
            return JsonDocument.Parse(elem.GetRawText());
        }

        if (metaVal is string jsonStr)
        {
            var trimmed = jsonStr.Trim();
            if (trimmed.StartsWith("{") || trimmed.StartsWith("["))
            {
                try
                {
                    return JsonDocument.Parse(trimmed);
                }
                catch (JsonException ex)
                {
                    throw new ArgumentException(
                        $"Metadata for key '{resourceKey}' is an invalid JSON string: {ex.Message}", ex);
                }
            }

            return JsonDocument.Parse(JsonSerializer.Serialize(new { value = jsonStr }));
        }

        try
        {
            var serialized = JsonSerializer.Serialize(metaVal);
            return JsonDocument.Parse(serialized);
        }
        catch (Exception ex)
        {
            throw new ArgumentException(
                $"Cannot serialize metadata value for key '{resourceKey}' into JSON: {ex.Message}", ex);
        }
    }
}
