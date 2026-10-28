using System.Collections;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.State.EntityStore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Contracts.Tools.Workspaces;

/// <summary>
/// Tool lọc tập hợp tài nguyên trong bộ nhớ (In-Memory Collection Filter).
/// Nhận danh sách Resources[] và lọc theo đuôi file, từ khóa để lấy First (Single) hoặc Filtered (Array).
/// </summary>
public class FilterResourcesTool(
    IExecutionEntityStore? entityStore = null,
    ILogger<FilterResourcesTool>? logger = null
) : IResolverTool
{
    public string Key => "FilterResources";
    public IReadOnlyList<string> Aliases => ["SelectResource", "FilterResourceList"];
    public string Label => "Filter Resources";
    public string? Category => "Workspaces & Resources";
    public string? Description => "Filters an in-memory collection of Resource entity references by file extension and keyword, outputting the first match and filtered array.";
    public bool IsPure => true;

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
            Description = "Batch of Resource entity references to filter"
        },
        new()
        {
            Id = "Extension",
            Label = "Extension",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            DefaultValue = "",
            Description = "File extension to filter (e.g. .duf, .fbx, .blend)"
        },
        new()
        {
            Id = "Keyword",
            Label = "Keyword",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            DefaultValue = "",
            Description = "Keyword to match in file name or relative path"
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "First",
            Label = "First",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Resource,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            Description = "The first matched Resource entity reference"
        },
        new()
        {
            Id = "Filtered",
            Label = "Filtered",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Resource,
            Cardinality = PinCardinality.Array,
            IsRequired = false,
            Description = "List of all matched Resource entity references"
        },
        new()
        {
            Id = "Count",
            Label = "Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Description = "Total number of resources matched"
        }
    ];

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var rawResources = inputs.GetValueOrDefault("Resources")
                           ?? inputs.GetValueOrDefault("resources")
                           ?? inputs.GetValueOrDefault("Items")
                           ?? inputs.GetValueOrDefault("items");

        var items = ExtractItems(rawResources);
        var targetExt = inputs.GetValueOrDefault("Extension")?.ToString()?.Trim() ?? string.Empty;
        if (!string.IsNullOrEmpty(targetExt) && !targetExt.StartsWith("."))
        {
            targetExt = "." + targetExt;
        }

        var keyword = inputs.GetValueOrDefault("Keyword")?.ToString()?.Trim() ?? string.Empty;

        var matchedItems = new List<object>();

        foreach (var item in items)
        {
            if (item == null) continue;

            var (_, parsedGuid, isValid) = EntityRefHelper.Parse(item);
            if (!isValid || parsedGuid == Guid.Empty)
            {
                continue;
            }

            var fileName = string.Empty;
            var ext = string.Empty;
            var relPath = string.Empty;

            if (entityStore != null)
            {
                var props = entityStore.GetProperties(WellKnownStructTypes.Resource, parsedGuid);
                if (props != null)
                {
                    fileName = props.GetValueOrDefault("FileName")?.ToString() ?? string.Empty;
                    ext = props.GetValueOrDefault("Extension")?.ToString() ?? string.Empty;
                    relPath = props.GetValueOrDefault("RelativePath")?.ToString() ?? string.Empty;
                }
            }

            // Kiểm tra điều kiện extension
            if (!string.IsNullOrEmpty(targetExt))
            {
                var extMatch = ext.Equals(targetExt, StringComparison.OrdinalIgnoreCase)
                               || fileName.EndsWith(targetExt, StringComparison.OrdinalIgnoreCase)
                               || relPath.EndsWith(targetExt, StringComparison.OrdinalIgnoreCase);
                if (!extMatch)
                {
                    continue;
                }
            }

            // Kiểm tra điều kiện keyword
            if (!string.IsNullOrEmpty(keyword))
            {
                var keyMatch = fileName.Contains(keyword, StringComparison.OrdinalIgnoreCase)
                               || relPath.Contains(keyword, StringComparison.OrdinalIgnoreCase);
                if (!keyMatch)
                {
                    continue;
                }
            }

            matchedItems.Add(item);
        }

        var first = matchedItems.FirstOrDefault();

        logger?.LogInformation(
            "FilterResources: Filtered {MatchedCount}/{TotalCount} items (Ext: '{Ext}', Keyword: '{Keyword}')",
            matchedItems.Count,
            items.Count,
            targetExt,
            keyword
        );

        return Task.FromResult(new Dictionary<string, object>
        {
            ["First"] = first ?? (object)string.Empty,
            ["Filtered"] = matchedItems,
            ["Count"] = matchedItems.Count,
            // Fallback aliases cho các graph cũ
            ["Resource"] = first ?? (object)string.Empty,
            ["Resources"] = matchedItems
        });
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
}
