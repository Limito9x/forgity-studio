using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.State.EntityStore;
using Automation.Repository.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Contracts.Tools.Workspaces;

/// <summary>
/// Tool giải mã tập hợp Resource entity references thành danh sách đường dẫn vật lý tuyệt đối (FullPaths)
/// trên ổ đĩa của Workstation và bản đồ metadata (MetadataMap).
/// </summary>
public class ResolveResourcesTool(
    IExecutionEntityStore? entityStore = null,
    IRepositoryApi? repositoryApi = null,
    ILogger<ResolveResourcesTool>? logger = null
) : IResolverTool
{
    public string Key => "ResolveResources";
    public string Label => "Resolve Resources";
    public string? Category => "Workspaces & Resources";
    public string? Description => "Resolves a batch of Resource entity refs into their absolute physical full paths on the workstation disk and metadata map.";
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
            Description = "Batch of Resource entity references to resolve"
        },
        new()
        {
            Id = "Workstation",
            Label = "Workstation",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Workstation,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            Description = "Optional target Workstation to compute absolute paths if not already cached"
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "FullPaths",
            Label = "Full Paths",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array,
            IsRequired = true,
            Description = "List of absolute physical paths on the workstation runner disk"
        },
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
            Id = "MetadataMap",
            Label = "Metadata Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = false,
            Description = "Mapping from FullPath to resource metadata/tags as JSON string"
        },
        new()
        {
            Id = "Count",
            Label = "Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Description = "Total number of resources resolved"
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        var rawResources = inputs.GetValueOrDefault("Resources")
                           ?? inputs.GetValueOrDefault("resources")
                           ?? inputs.GetValueOrDefault("Items")
                           ?? inputs.GetValueOrDefault("items");

        var items = ExtractItems(rawResources);
        var fullPaths = new List<string>();
        var relativePaths = new List<string>();
        var missingGuids = new List<Guid>();
        var metadataMap = new Dictionary<string, object>();

        // 1. Phân giải RootPath từ Workstation nếu có
        var rootPath = string.Empty;
        var wsInput = inputs.GetValueOrDefault("Workstation")
                      ?? inputs.GetValueOrDefault("workstation");

        if (wsInput != null)
        {
            var (_, wsGuid, isValid) = EntityRefHelper.Parse(wsInput);
            if (!isValid && Guid.TryParse(wsInput.ToString(), out var parsedGuid))
            {
                wsGuid = parsedGuid;
                isValid = true;
            }

            if (isValid && wsGuid != Guid.Empty)
            {
                if (entityStore != null)
                {
                    var wsProps = entityStore.GetProperties(WellKnownStructTypes.Workstation, wsGuid);
                    if (wsProps != null && wsProps.TryGetValue("RootPath", out var rpObj) && rpObj is string rpStr && !string.IsNullOrWhiteSpace(rpStr))
                    {
                        rootPath = rpStr.Trim().Replace('\\', '/');
                    }
                }

                if (string.IsNullOrEmpty(rootPath) && repositoryApi != null)
                {
                    var wsResult = await repositoryApi.GetWorkstationByIdAsync(wsGuid, ct);
                    if (wsResult.IsSuccess && wsResult.Value != null && !string.IsNullOrWhiteSpace(wsResult.Value.RootPath))
                    {
                        rootPath = wsResult.Value.RootPath.Trim().Replace('\\', '/');
                    }
                }
            }
        }

        // 2. Duyệt qua từng item để resolve FullPath và RelativePath
        foreach (var item in items)
        {
            if (item == null) continue;

            // Kiểm tra nếu item đã là chuỗi đường dẫn trực tiếp
            if (item is string strVal)
            {
                var trimmed = strVal.Trim();
                if (IsLikelyFilePath(trimmed))
                {
                    var normalized = trimmed.Replace('\\', '/');
                    var full = Path.IsPathRooted(normalized) || (!string.IsNullOrEmpty(rootPath) && !normalized.Contains(':'))
                        ? (Path.IsPathRooted(normalized) ? normalized : Path.Combine(rootPath, normalized).Replace('\\', '/'))
                        : normalized;

                    fullPaths.Add(full);
                    relativePaths.Add(normalized);
                    metadataMap[full] = new Dictionary<string, object?>
                    {
                        ["asset_name"] = Path.GetFileNameWithoutExtension(normalized),
                        ["full_path"] = full,
                        ["relative_path"] = normalized,
                        ["file_name"] = Path.GetFileName(normalized)
                    };
                    continue;
                }
            }

            // Giải mã GUID thông qua EntityRefHelper
            var (_, parsedGuid, isValidGuid) = EntityRefHelper.Parse(item);
            if (!isValidGuid || parsedGuid == Guid.Empty)
            {
                logger?.LogWarning("ResolveResources: Skipping unresolvable item '{Item}'", item);
                continue;
            }

            // Tra cứu trong EntityStore cache
            if (entityStore != null)
            {
                var props = entityStore.GetProperties(WellKnownStructTypes.Resource, parsedGuid);
                if (props != null)
                {
                    var (full, rel) = ComputePaths(props, rootPath);
                    if (!string.IsNullOrEmpty(full) || !string.IsNullOrEmpty(rel))
                    {
                        var resolvedFull = !string.IsNullOrEmpty(full) ? full : rel;
                        fullPaths.Add(resolvedFull);
                        relativePaths.Add(rel);
                        BuildAndStoreMetadata(resolvedFull, rel, props, metadataMap);
                        continue;
                    }
                }
            }

            missingGuids.Add(parsedGuid);
        }

        // 3. Self-healing prefetch từ Database nếu thiếu trong cache
        if (missingGuids.Count > 0 && entityStore != null)
        {
            logger?.LogInformation(
                "ResolveResources: Prefetching {MissingCount} uncached resource(s) from database...",
                missingGuids.Count
            );

            try
            {
                await entityStore.PrefetchResourcesAsync(missingGuids, ct);

                foreach (var guid in missingGuids)
                {
                    var props = entityStore.GetProperties(WellKnownStructTypes.Resource, guid);
                    if (props != null)
                    {
                        var (full, rel) = ComputePaths(props, rootPath);
                        var resolvedFull = !string.IsNullOrEmpty(full) ? full : rel;
                        if (!string.IsNullOrEmpty(resolvedFull))
                        {
                            fullPaths.Add(resolvedFull);
                            relativePaths.Add(rel);
                            BuildAndStoreMetadata(resolvedFull, rel, props, metadataMap);
                            logger?.LogDebug("ResolveResources: Successfully loaded {Guid} → '{Path}'", guid, resolvedFull);
                        }
                    }
                    else
                    {
                        logger?.LogWarning("ResolveResources: Resource '{Guid}' not found in database.", guid);
                    }
                }
            }
            catch (Exception ex)
            {
                logger?.LogError(ex, "ResolveResources: Error while prefetching resources from database.");
            }
        }

        logger?.LogInformation(
            "ResolveResources: Resolved {Count} item(s) → FullPaths: [{Paths}] (Metadata mapped: {MappedCount})",
            fullPaths.Count,
            string.Join(", ", fullPaths),
            metadataMap.Count
        );

        return new Dictionary<string, object>
        {
            ["FullPaths"] = fullPaths.ToArray(),
            ["RelativePaths"] = relativePaths.ToArray(),
            ["MetadataMap"] = metadataMap,
            ["Count"] = fullPaths.Count,
            // Runner aliases
            ["full_paths"] = fullPaths.ToArray(),
            ["relative_paths"] = relativePaths.ToArray(),
            ["metadata_map"] = metadataMap
        };
    }

    private static (string FullPath, string RelativePath) ComputePaths(
        IReadOnlyDictionary<string, object?> props,
        string rootPath
    )
    {
        var rel = props.GetValueOrDefault("RelativePath")?.ToString()?.Trim().Replace('\\', '/') ?? string.Empty;
        var full = props.GetValueOrDefault("FullPath")?.ToString()?.Trim().Replace('\\', '/') ?? string.Empty;

        if (string.IsNullOrEmpty(full) && !string.IsNullOrEmpty(rel) && !string.IsNullOrEmpty(rootPath))
        {
            full = Path.Combine(rootPath, rel).Replace('\\', '/');
        }

        return (full, rel);
    }

    private static void BuildAndStoreMetadata(
        string fullPath,
        string relativePath,
        IReadOnlyDictionary<string, object?> props,
        Dictionary<string, object> metadataMap
    )
    {
        var entry = new Dictionary<string, object?>
        {
            ["full_path"] = fullPath,
            ["relative_path"] = relativePath,
            ["file_name"] = props.GetValueOrDefault("FileName")?.ToString() ?? Path.GetFileName(fullPath),
            ["asset_name"] = props.GetValueOrDefault("BaseName")?.ToString() ?? Path.GetFileNameWithoutExtension(fullPath),
            ["extension"] = props.GetValueOrDefault("Extension")?.ToString() ?? Path.GetExtension(fullPath)
        };

        if (props.TryGetValue("Metadata", out var metaObj) && metaObj != null)
        {
            var metaStr = metaObj.ToString();
            if (!string.IsNullOrWhiteSpace(metaStr) && metaStr.TrimStart().StartsWith("{"))
            {
                try
                {
                    using var doc = JsonDocument.Parse(metaStr);
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        entry[prop.Name] = prop.Value.Clone();
                    }
                }
                catch
                {
                    entry["raw_metadata"] = metaStr;
                }
            }
        }

        // Key duy nhất của MetadataMap là FullPath
        metadataMap[fullPath] = entry;
    }

    private static List<object> ExtractItems(object? raw)
    {
        var list = new List<object>();
        if (raw == null) return list;

        if (raw is IEnumerable enumerable && raw is not string && raw is not IDictionary)
        {
            foreach (var el in enumerable)
            {
                if (el != null) list.Add(el);
            }
        }
        else
        {
            list.Add(raw);
        }

        return list;
    }

    private static bool IsLikelyFilePath(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return false;
        if (s.Contains('/') || s.Contains('\\')) return true;
        return Path.HasExtension(s);
    }
}
