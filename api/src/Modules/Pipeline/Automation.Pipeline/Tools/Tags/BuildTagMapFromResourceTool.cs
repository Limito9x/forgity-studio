using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools.Attributes;
using Automation.Tag.Contracts.Dtos;
using Automation.Repository.Contracts;
using Automation.Repository.Contracts.Dtos;
using Automation.Repository.Contracts.Extensions;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Tags;

public class BuildTagMapFromResourceInputs
{
    [ToolPin(
        Id = "Target",
        Label = "Resources",
        PrimitiveType = PinPrimitiveType.EntityRef,
        Cardinality = PinCardinality.Array,
        IsRequired = true,
        Metadata = """{"type": "entity-select", "properties": {"entity": "Resource", "multiple": true}}"""
    )]
    public object? Target { get; set; }

    [ToolPin(
        Id = "Tags",
        Label = "Filter Tags",
        PrimitiveType = PinPrimitiveType.EntityRef,
        Cardinality = PinCardinality.Array,
        IsRequired = false,
        Metadata = """{"type": "tag-tree-select", "entityTarget": "Tag"}"""
    )]
    public object? Tags { get; set; }

    [ToolPin(
        Id = "KeyMode",
        Label = "Key Mode",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = false,
        DefaultValue = "Both",
        Metadata = """{"type": "select", "options": ["Both", "LeafOnly", "FullPathOnly"]}"""
    )]
    public string KeyMode { get; set; } = "Both";

    [ToolPin(
        Id = "RootPath",
        Label = "Root Tag Path",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = false
    )]
    public string? RootPath { get; set; }
}

public class BuildTagMapFromResourceOutputs
{
    [ToolPin(
        Id = "ObjectsMap",
        Label = "Objects Map",
        PrimitiveType = PinPrimitiveType.EntityRef,
        Cardinality = PinCardinality.Map,
        Metadata = "TaggedAsset",
        IsRequired = true
    )]
    public Dictionary<string, object?> ObjectsMap { get; set; } = [];

    [ToolPin(
        Id = "AllTags",
        Label = "All Tags",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Array,
        IsRequired = false
    )]
    public List<string> AllTags { get; set; } = [];
}

public class BuildTagMapFromResourceTool(
    IRepositoryApi workspaceApi,
    ILogger<BuildTagMapFromResourceTool> logger
) : BaseResolverTool<BuildTagMapFromResourceInputs, BuildTagMapFromResourceOutputs>
{
    public override string Key => "BuildTagMapFromResource";
    public override IReadOnlyList<string> Aliases => ["BuildTagMapFromInspection"];
    public override string Label => "Build Tag Map from Resource";
    public override string? Category => "Tag & Metadata";
    public override string? Description => "Builds an ObjectsMap of TaggedAsset items from target Resources and their metadata.";
    public override bool IsPure => true;

    protected override async Task<BuildTagMapFromResourceOutputs> ExecuteCoreAsync(
        BuildTagMapFromResourceInputs input,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        // 1. Extract Target Resource GUIDs
        var resourceGuids = ExtractGuids(input.Target);
        if (resourceGuids.Count == 0)
        {
            throw new ArgumentException($"Invalid or empty Target Resource GUID(s): '{input.Target}'");
        }

        // 2. Parse options
        var rootTagPath = input.RootPath?.Trim();
        var keyMode = string.IsNullOrWhiteSpace(input.KeyMode) ? "Both" : input.KeyMode.Trim();

        var filterTagGuids = ExtractGuids(input.Tags).ToHashSet();
        var filterTagPaths = ExtractStrings(input.Tags).ToHashSet(StringComparer.OrdinalIgnoreCase);

        // 3. Query batch resource details
        var batchResult = await workspaceApi.GetBatchResourceDetailsAsync(resourceGuids, ct);
        if (!batchResult.IsSuccess || batchResult.Value == null)
        {
            throw new InvalidOperationException(
                $"Failed to get batch resource details: {batchResult.Reasons.FirstOrDefault()?.Message}"
            );
        }

        var detailsDict = batchResult.Value;
        var objectsMap = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var allTagsSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Ensure distinct items in case ID was passed twice
        var processedGuids = new HashSet<Guid>();

        foreach (var guid in resourceGuids)
        {
            if (processedGuids.Contains(guid) || !detailsDict.TryGetValue(guid, out var item))
                continue;

            processedGuids.Add(item.ResourceId);
            processedGuids.Add(item.ResourceVersionId);

            var assetName = !string.IsNullOrWhiteSpace(item.Name)
                ? item.Name
                : (!string.IsNullOrWhiteSpace(item.RelativePath)
                    ? Path.GetFileNameWithoutExtension(item.RelativePath)
                    : item.ResourceId.ToString());

            var assetPathMap = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            var assetTagMap = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            // A. Process Material/Subpath Tags
            if (item.TagMap != null && item.TagMap.Count > 0)
            {
                foreach (var (path, tagLinks) in item.TagMap)
                {
                    if (tagLinks == null || tagLinks.Count == 0) continue;

                    var val = item.Metadata != null
                        ? item.Metadata.RootElement.ExtractJsonValue(path)
                        : null;

                    var matchedTagItems = new List<Dictionary<string, object?>>();

                    foreach (var tag in tagLinks)
                    {
                        // Filter by RootTagPath
                        if (!string.IsNullOrWhiteSpace(rootTagPath) &&
                            !tag.TagPath.StartsWith(rootTagPath, StringComparison.OrdinalIgnoreCase))
                            continue;

                        // Filter by Tags pin if specified
                        if (filterTagGuids.Count > 0 || filterTagPaths.Count > 0)
                        {
                            var matchesGuid = filterTagGuids.Contains(tag.TagId);
                            var matchesPath = filterTagPaths.Contains(tag.TagPath) || filterTagPaths.Contains(tag.TagName);
                            if (!matchesGuid && !matchesPath)
                                continue;
                        }

                        if (!string.IsNullOrWhiteSpace(tag.TagName))
                        {
                            allTagsSet.Add(tag.TagName);
                        }
                        if (!string.IsNullOrWhiteSpace(tag.TagPath))
                        {
                            allTagsSet.Add(tag.TagPath);
                        }

                        matchedTagItems.Add(new Dictionary<string, object?>
                        {
                            ["id"] = tag.TagId.ToString(),
                            ["name"] = tag.TagName,
                            ["path"] = tag.TagPath
                        });

                        // Populate assetTagMap based on KeyMode
                        if (string.Equals(keyMode, "Both", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(keyMode, "LeafOnly", StringComparison.OrdinalIgnoreCase))
                        {
                            if (!string.IsNullOrWhiteSpace(tag.TagName))
                                assetTagMap[tag.TagName] = val;
                        }

                        if (string.Equals(keyMode, "Both", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(keyMode, "FullPathOnly", StringComparison.OrdinalIgnoreCase))
                        {
                            if (!string.IsNullOrWhiteSpace(tag.TagPath))
                                assetTagMap[tag.TagPath] = val;
                        }
                    }

                    if (matchedTagItems.Count > 0)
                    {
                        assetPathMap[path] = new Dictionary<string, object?>
                        {
                            ["value"] = val,
                            ["tags"] = matchedTagItems
                        };
                    }
                }
            }

            // B. Extract Resource-level Tags (e.g. ClothType.Top)
            var resourceTagStrings = item.ResourceTags?
                .Select(t => t.TagPath)
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .ToList() ?? [];

            // Add resource-level tags to AllTags as well
            foreach (var rTag in resourceTagStrings)
            {
                allTagsSet.Add(rTag);
            }

            // C. Build asset entry for ObjectsMap
            var assetObj = new Dictionary<string, object?>
            {
                ["resource_id"] = item.ResourceId.ToString(),
                ["version_id"] = item.ResourceVersionId.ToString(),
                ["asset_name"] = assetName,
                ["relative_path"] = item.RelativePath,
                ["file_path"] = item.FullLocalPath ?? item.RelativePath,
                ["resource_tags"] = resourceTagStrings,
                ["path_map"] = assetPathMap,
                ["tag_map"] = assetTagMap
            };

            objectsMap[assetName] = assetObj;
        }

        logger.LogInformation(
            "BuildTagMapFromResource processed {AssetCount} assets with {TagCount} unique tags.",
            objectsMap.Count,
            allTagsSet.Count
        );

        return new BuildTagMapFromResourceOutputs
        {
            ObjectsMap = objectsMap,
            AllTags = allTagsSet.ToList()
        };
    }

    private static List<Guid> ExtractGuids(object? input)
    {
        var result = new List<Guid>();
        if (input == null) return result;

        if (input is JsonElement je && je.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in je.EnumerateArray())
            {
                var guid = EntityRefHelper.ExtractRefId(item);
                if (guid.HasValue) result.Add(guid.Value);
            }
            return result;
        }

        if (input is not string && input is System.Collections.IEnumerable enumerable)
        {
            foreach (var item in enumerable)
            {
                var guid = EntityRefHelper.ExtractRefId(item);
                if (guid.HasValue) result.Add(guid.Value);
            }
            return result;
        }

        var single = EntityRefHelper.ExtractRefId(input);
        if (single.HasValue)
        {
            result.Add(single.Value);
        }

        return result;
    }

    private static List<string> ExtractStrings(object? input)
    {
        var result = new List<string>();
        if (input == null) return result;

        if (input is JsonElement je && je.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in je.EnumerateArray())
            {
                var str = item.ValueKind == JsonValueKind.String ? item.GetString() : item.ToString();
                if (!string.IsNullOrWhiteSpace(str)) result.Add(str.Trim());
            }
            return result;
        }

        if (input is not string && input is System.Collections.IEnumerable enumerable)
        {
            foreach (var item in enumerable)
            {
                var str = item?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(str)) result.Add(str);
            }
            return result;
        }

        var singleStr = input.ToString()?.Trim();
        if (!string.IsNullOrWhiteSpace(singleStr))
        {
            result.Add(singleStr);
        }

        return result;
    }
}
