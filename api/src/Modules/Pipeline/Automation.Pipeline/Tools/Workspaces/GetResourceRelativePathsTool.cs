using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.EntityStore;
using Microsoft.Extensions.Logging;
using EntityRefHelper = Automation.Pipeline.Domain.ValueObjects.EntityRefHelper;

namespace Automation.Pipeline.Tools.Workspaces;

/// <summary>
/// Generic batch tool: nhận một danh sách Resource entity refs (hoặc đối tượng Resource, GUID, chuỗi đường dẫn)
/// và giải quyết ra danh sách đường dẫn tương đối (RelativePath).
///
/// Tự động tra cứu từ ExecutionEntityStore cache (Zero I/O), và tự động nạp bổ sung từ database
/// nếu entity chưa có trong cache (Self-healing).
/// </summary>
public class GetResourceRelativePathsTool(
    IExecutionEntityStore? entityStore = null,
    ILogger<GetResourceRelativePathsTool>? logger = null
) : IResolverTool
{
    public string Key => "GetResourceRelativePaths";
    public string Label => "Get Resource Relative Paths";
    public string? Category => "Workspaces";
    public string? Description => "Resolves a batch of Resource entity refs or IDs into their POSIX relative paths within the repository.";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Resources",
            Label = "Resources",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Resource,
            Cardinality = PinCardinality.Array,
            IsRequired = true,
            Description = "Batch of Resource entity refs to resolve relative paths for"
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "RelativePaths",
            Label = "Relative Paths",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array,
            IsRequired = false,
            Description = "List of POSIX relative paths within the repository"
        },
        new()
        {
            Id = "Count",
            Label = "Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        },
        new()
        {
            Id = "MetadataMap",
            Label = "Metadata Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = false,
            Description = "Mapping from POSIX relative path to resource metadata/tags as JSON string",
            SampleJson = "{\n  \"characters/hero.fbx\": {\n    \"triangles\": 14200,\n    \"rig\": \"Humanoid\"\n  }\n}"
        }
    ];

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    ) => (Inputs, Outputs);

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var rawResources = inputs.GetValueOrDefault("Resources")
                           ?? inputs.GetValueOrDefault("resources")
                           ?? inputs.GetValueOrDefault("Items")
                           ?? inputs.GetValueOrDefault("items")
                           ?? inputs.GetValueOrDefault("Inputs")
                           ?? inputs.GetValueOrDefault("inputs");

        var items = ExtractItems(rawResources);
        var relativePaths = new List<string>();
        var missingGuids = new List<Guid>();
        var metadataMap = new Dictionary<string, object>();

        foreach (var item in items)
        {
            if (item == null) continue;

            // 1. Kiểm tra nếu item đã chứa RelativePath trực tiếp (JSON object, dictionary, hoặc dynamic object)
            if (TryExtractDirectPath(item, out var directPath))
            {
                if (!string.IsNullOrWhiteSpace(directPath))
                {
                    var posix = directPath.Trim().Replace('\\', '/');
                    relativePaths.Add(posix);
                    var entry = new Dictionary<string, object?>
                    {
                        ["asset_name"] = Path.GetFileNameWithoutExtension(posix),
                        ["relative_path"] = posix,
                        ["file_name"] = Path.GetFileName(posix)
                    };
                    metadataMap[posix] = entry;
                    continue;
                }
            }

            // 2. Kiểm tra nếu item là chuỗi đường dẫn tương đối trực tiếp (e.g. "Scenes/GameRepo/model.duf")
            if (item is string strVal)
            {
                var trimmed = strVal.Trim();
                if (IsLikelyFilePath(trimmed))
                {
                    var posix = trimmed.Replace('\\', '/');
                    relativePaths.Add(posix);
                    var entry = new Dictionary<string, object?>
                    {
                        ["asset_name"] = Path.GetFileNameWithoutExtension(posix),
                        ["relative_path"] = posix,
                        ["file_name"] = Path.GetFileName(posix)
                    };
                    metadataMap[posix] = entry;
                    continue;
                }
            }

            // 3. Giải mã GUID thông qua EntityRefHelper
            var (_, parsedGuid, isValid) = EntityRefHelper.Parse(item);
            if (!isValid || parsedGuid == Guid.Empty)
            {
                logger?.LogWarning("GetResourceRelativePaths: Skipping unresolvable item '{Item}'", item);
                continue;
            }

            // Tra cứu trong EntityStore cache
            if (entityStore != null)
            {
                var props = entityStore.GetProperties("resource", parsedGuid);
                if (props != null && props.TryGetValue("RelativePath", out var relPath) && relPath is string relPathStr && !string.IsNullOrWhiteSpace(relPathStr))
                {
                    var posix = relPathStr.Trim().Replace('\\', '/');
                    relativePaths.Add(posix);
                    BuildAndStoreMaps(posix, props, metadataMap);
                    continue;
                }
            }

            // Chưa có trong cache -> cần prefetch
            missingGuids.Add(parsedGuid);
        }

        // 4. Self-healing: Nếu có ID chưa có trong cache, gọi batch prefetch từ database ngay lập tức
        if (missingGuids.Count > 0 && entityStore != null)
        {
            logger?.LogInformation(
                "GetResourceRelativePaths: Prefetching {MissingCount} uncached resource(s) from database...",
                missingGuids.Count
            );

            try
            {
                await entityStore.PrefetchResourcesAsync(missingGuids, context.CancellationToken);

                foreach (var guid in missingGuids)
                {
                    var props = entityStore.GetProperties("resource", guid);
                    if (props != null && props.TryGetValue("RelativePath", out var relPath) && relPath is string relPathStr && !string.IsNullOrWhiteSpace(relPathStr))
                    {
                        var posix = relPathStr.Trim().Replace('\\', '/');
                        relativePaths.Add(posix);
                        BuildAndStoreMaps(posix, props, metadataMap);
                        logger?.LogDebug("GetResourceRelativePaths: Successfully loaded {Guid} → '{Path}'", guid, posix);
                    }
                    else
                    {
                        logger?.LogWarning("GetResourceRelativePaths: Resource '{Guid}' has no RelativePath in database.", guid);
                    }
                }
            }
            catch (Exception ex)
            {
                logger?.LogError(ex, "GetResourceRelativePaths: Error while prefetching resources from database.");
            }
        }

        logger?.LogInformation(
            "GetResourceRelativePaths: Resolved {Count} path(s) → [{Paths}] (Metadata mapped: {MappedCount})",
            relativePaths.Count,
            string.Join(", ", relativePaths),
            metadataMap.Count
        );

        return new Dictionary<string, object>
        {
            ["RelativePaths"] = relativePaths.ToArray(),
            ["Count"] = relativePaths.Count,
            ["relative_paths"] = relativePaths.ToArray(),
            ["MetadataMap"] = metadataMap,
            ["metadata_map"] = metadataMap
        };
    }

    private static void BuildAndStoreMaps(
        string posixPath,
        IReadOnlyDictionary<string, object?> props,
        Dictionary<string, object> metadataMap
    )
    {
        var assetName = props.GetValueOrDefault("BaseName")?.ToString()
                        ?? props.GetValueOrDefault("DisplayName")?.ToString()
                        ?? Path.GetFileNameWithoutExtension(posixPath);

        object? parsedMeta = null;
        JsonDocument? jsonDoc = null;
        if (props.TryGetValue("Metadata", out var metaRaw) && metaRaw is string metaStr && !string.IsNullOrWhiteSpace(metaStr))
        {
            try
            {
                jsonDoc = JsonDocument.Parse(metaStr);
                parsedMeta = jsonDoc.RootElement.Clone();
            }
            catch
            {
                parsedMeta = metaStr;
            }
        }

        var resEntry = new Dictionary<string, object?>
        {
            ["asset_name"] = assetName,
            ["relative_path"] = posixPath,
            ["file_path"] = posixPath,
            ["file_name"] = props.GetValueOrDefault("FileName") ?? Path.GetFileName(posixPath),
            ["extension"] = props.GetValueOrDefault("Extension") ?? Path.GetExtension(posixPath).TrimStart('.'),
            ["resource_id"] = props.GetValueOrDefault("ResourceId")?.ToString() ?? string.Empty,
            ["version_id"] = props.GetValueOrDefault("ResourceVersionId")?.ToString() ?? string.Empty,
            ["repository_id"] = props.GetValueOrDefault("RepositoryId")?.ToString() ?? string.Empty,
            ["content_name"] = props.GetValueOrDefault("ContentName")?.ToString() ?? string.Empty,
            ["content_type"] = props.GetValueOrDefault("ContentType")?.ToString() ?? string.Empty,
            ["metadata"] = parsedMeta
        };

        if (parsedMeta is JsonElement rootElem && rootElem.ValueKind == JsonValueKind.Object)
        {
            UnwrapJsonElementMetadata(rootElem, assetName, resEntry);
        }
        else if (parsedMeta is Dictionary<string, object> metaDict)
        {
            if (metaDict.TryGetValue("slots", out var sVal)) resEntry["slots"] = sVal;
            if (metaDict.TryGetValue("slot_count", out var scVal)) resEntry["slot_count"] = scVal;
            if (metaDict.TryGetValue("raw_textures", out var rtVal)) resEntry["raw_textures"] = rtVal;
        }

        jsonDoc?.Dispose();
        metadataMap[posixPath] = resEntry;
    }

    private static void UnwrapJsonElementMetadata(
        JsonElement root,
        string assetName,
        Dictionary<string, object?> resEntry
    )
    {
        // 1. Root-level slots / slot_count / raw_textures
        if (root.TryGetProperty("slots", out var sElem)) resEntry["slots"] = sElem.Clone();
        if (root.TryGetProperty("slot_count", out var scElem) && scElem.TryGetInt32(out var sc)) resEntry["slot_count"] = sc;
        if (root.TryGetProperty("raw_textures", out var rtElem)) resEntry["raw_textures"] = rtElem.Clone();

        // 2. Nested "objects" -> "Sam" -> "slots" (Blender inspector output)
        if (!resEntry.ContainsKey("slots") && root.TryGetProperty("objects", out var objsElem) && objsElem.ValueKind == JsonValueKind.Object)
        {
            JsonElement targetObj = default;
            bool found = false;

            if (objsElem.TryGetProperty(assetName, out var namedObj) && namedObj.ValueKind == JsonValueKind.Object)
            {
                targetObj = namedObj;
                found = true;
            }
            else
            {
                foreach (var prop in objsElem.EnumerateObject())
                {
                    if (prop.Value.ValueKind == JsonValueKind.Object)
                    {
                        targetObj = prop.Value;
                        found = true;
                        break;
                    }
                }
            }

            if (found)
            {
                if (targetObj.TryGetProperty("slots", out var innerSlots)) resEntry["slots"] = innerSlots.Clone();
                if (targetObj.TryGetProperty("slot_count", out var innerCount) && innerCount.TryGetInt32(out var count))
                {
                    resEntry["slot_count"] = count;
                }
                else if (targetObj.TryGetProperty("slots", out var slElem) && slElem.ValueKind == JsonValueKind.Array)
                {
                    resEntry["slot_count"] = slElem.GetArrayLength();
                }
                if (targetObj.TryGetProperty("raw_textures", out var innerTextures)) resEntry["raw_textures"] = innerTextures.Clone();
            }
        }
    }

    // --- Helpers ---

    private static bool TryExtractDirectPath(object item, out string? path)
    {
        path = null;

        if (item is JsonElement elem && elem.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in elem.EnumerateObject())
            {
                if (string.Equals(prop.Name, "RelativePath", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(prop.Name, "relativePath", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(prop.Name, "path", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(prop.Name, "FilePath", StringComparison.OrdinalIgnoreCase))
                {
                    var val = prop.Value.GetString();
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        path = val;
                        return true;
                    }
                }
            }
        }
        else if (item is IDictionary dict)
        {
            foreach (var key in dict.Keys)
            {
                if (key == null) continue;
                var kStr = key.ToString();
                if (string.Equals(kStr, "RelativePath", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(kStr, "relativePath", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(kStr, "path", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(kStr, "FilePath", StringComparison.OrdinalIgnoreCase))
                {
                    var val = dict[key]?.ToString();
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        path = val;
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private static bool IsLikelyFilePath(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return false;
        if (Guid.TryParse(s, out _)) return false;
        if (s.StartsWith('{') || s.StartsWith('[')) return false;
        if (s.StartsWith("resource:", StringComparison.OrdinalIgnoreCase) ||
            s.StartsWith("urn:", StringComparison.OrdinalIgnoreCase)) return false;

        // Nếu có dấu gạch phân cách thư mục hoặc có đuôi file (chứa dấu chấm)
        return s.Contains('/') || s.Contains('\\') || (s.Contains('.') && !s.Contains(' '));
    }

    private static List<object?> ExtractItems(object? raw)
    {
        var result = new List<object?>();
        if (raw == null) return result;

        if (raw is JsonElement jsonElem)
        {
            if (jsonElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in jsonElem.EnumerateArray())
                {
                    result.AddRange(ExtractItems(item));
                }
                return result;
            }
            if (jsonElem.ValueKind == JsonValueKind.Object)
            {
                result.Add(jsonElem.Clone());
                return result;
            }
            if (jsonElem.ValueKind == JsonValueKind.String)
            {
                var s = jsonElem.GetString();
                if (s != null)
                {
                    result.AddRange(ExtractItems(s));
                }
                return result;
            }
        }

        if (raw is string str)
        {
            var trimmed = str.Trim();
            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                try
                {
                    using var doc = JsonDocument.Parse(trimmed);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in doc.RootElement.EnumerateArray())
                        {
                            result.AddRange(ExtractItems(item));
                        }
                        return result;
                    }
                }
                catch { }
            }
            result.Add(trimmed);
            return result;
        }

        if (raw is IEnumerable enumerable && raw is not IDictionary)
        {
            foreach (var item in enumerable)
            {
                result.AddRange(ExtractItems(item));
            }
            return result;
        }

        result.Add(raw);
        return result;
    }
}
