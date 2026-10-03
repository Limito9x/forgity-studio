using System.Collections;
using System.Text.Json;
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
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Resources",
            Label = "Resources",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "Resource",
            Cardinality = PinCardinality.Array,
            IsRequired = true
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
            IsRequired = false
        },
        new()
        {
            Id = "Count",
            Label = "Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = false
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

        foreach (var item in items)
        {
            if (item == null) continue;

            // 1. Kiểm tra nếu item đã chứa RelativePath trực tiếp (JSON object, dictionary, hoặc dynamic object)
            if (TryExtractDirectPath(item, out var directPath))
            {
                if (!string.IsNullOrWhiteSpace(directPath))
                {
                    relativePaths.Add(directPath);
                    continue;
                }
            }

            // 2. Kiểm tra nếu item là chuỗi đường dẫn tương đối trực tiếp (e.g. "Scenes/GameRepo/model.duf")
            if (item is string strVal)
            {
                var trimmed = strVal.Trim();
                if (IsLikelyFilePath(trimmed))
                {
                    relativePaths.Add(trimmed);
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
                    relativePaths.Add(relPathStr);
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
                        relativePaths.Add(relPathStr);
                        logger?.LogDebug("GetResourceRelativePaths: Successfully loaded {Guid} → '{Path}'", guid, relPathStr);
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
            "GetResourceRelativePaths: Resolved {Count} path(s) → [{Paths}]",
            relativePaths.Count,
            string.Join(", ", relativePaths)
        );

        return new Dictionary<string, object>
        {
            ["RelativePaths"] = relativePaths.ToArray(),
            ["Count"] = relativePaths.Count,
            ["relative_paths"] = relativePaths.ToArray()
        };
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
