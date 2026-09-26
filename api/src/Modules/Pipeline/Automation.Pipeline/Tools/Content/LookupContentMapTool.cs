using System.Collections;
using System.Text.Json;
using Automation.Content.Contracts;
using Automation.DynamicForms.Contracts;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Content;

/// <summary>
/// Tool tra cứu các Content Item trong Project theo danh sách Tên/Tag hoặc theo ContentType,
/// và trả về Map dữ liệu đã phân giải (bao gồm cả schema data/texture params) kèm danh sách các key bị thiếu.
/// Tự động lấy ProjectId từ ToolExecutionContext mà không cần chân cắm ProjectId trên Canvas.
/// </summary>
public class LookupContentMapTool(
    IContentApi contentApi,
    ISchemaApi schemaApi,
    PipelineDbContext db,
    ILogger<LookupContentMapTool> logger
) : IResolverTool
{
    public string Key => "LookupContentMap";
    public IReadOnlyList<string> Aliases => ["GetContentMapByKeys", "GetContentMapByNames", "FindContentItems"];
    public string Label => "Lookup Content Map";
    public string? Category => "Content & Struct";
    public bool IsPure => true;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Keys",
            Label = "Keys / Tags / Names",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array,
            IsRequired = false
        },
        new()
        {
            Id = "ContentType",
            Label = "Content Type",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            Metadata = """{"type": "entity-select", "properties": {"entity": "ContentType"}}"""
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "ContentMap",
            Label = "Content Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = true
        },
        new()
        {
            Id = "MissingKeys",
            Label = "Missing Keys",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array,
            IsRequired = false
        },
        new()
        {
            Id = "ContentIds",
            Label = "Content IDs",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Array,
            IsRequired = false
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        // 1. Resolve ProjectId from ToolExecutionContext or fallback to Pipeline DB
        var projectId = context.ProjectId;
        if (projectId == Guid.Empty && context.PipelineId != Guid.Empty)
        {
            projectId = await db.Pipelines
                .AsNoTracking()
                .Where(p => p.Id == context.PipelineId)
                .Select(p => p.ProjectId)
                .FirstOrDefaultAsync(ct);
        }

        if (projectId == Guid.Empty)
        {
            var pObj = inputs.GetValueOrDefault("ProjectId") ?? inputs.GetValueOrDefault("projectId");
            var parsed = EntityRefHelper.ExtractRefId(pObj);
            if (parsed.HasValue) projectId = parsed.Value;
        }

        var contentMap = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var missingKeys = new List<string>();
        var contentIds = new List<Guid>();

        if (projectId == Guid.Empty)
        {
            logger.LogWarning("LookupContentMap: Unable to resolve ProjectId for Pipeline {PipelineId}", context.PipelineId);
            return new Dictionary<string, object>
            {
                ["ContentMap"] = contentMap,
                ["MissingKeys"] = missingKeys,
                ["ContentIds"] = contentIds
            };
        }

        // 2. Fetch all Content items for this Project
        var contentsResult = await contentApi.GetContentsByProjectIdAsync(projectId, ct);
        if (!contentsResult.IsSuccess || contentsResult.Value == null || contentsResult.Value.Count == 0)
        {
            logger.LogInformation("LookupContentMap: No content items found for Project {ProjectId}", projectId);
            var reqKeys = ExtractKeys(inputs);
            return new Dictionary<string, object>
            {
                ["ContentMap"] = contentMap,
                ["MissingKeys"] = reqKeys,
                ["ContentIds"] = contentIds
            };
        }

        var allItems = contentsResult.Value.Values.ToList();

        // 3. Filter by ContentType if specified
        var contentTypeFilter = (inputs.GetValueOrDefault("ContentType") ?? inputs.GetValueOrDefault("contentType"))?.ToString()?.Trim();
        if (!string.IsNullOrEmpty(contentTypeFilter))
        {
            allItems = allItems
                .Where(c => string.Equals(c.ContentTypeName, contentTypeFilter, StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(c.ContentTypeId.ToString(), contentTypeFilter, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (allItems.Count == 0)
        {
            logger.LogInformation("LookupContentMap: No content items matched ContentType '{ContentType}'", contentTypeFilter);
            var reqKeys = ExtractKeys(inputs);
            return new Dictionary<string, object>
            {
                ["ContentMap"] = contentMap,
                ["MissingKeys"] = reqKeys,
                ["ContentIds"] = contentIds
            };
        }

        // 4. Batch fetch schema data for all candidate items (avoids N+1)
        var clientIds = allItems.Select(c => c.Id.ToString()).ToList();
        var schemaDataResult = await schemaApi.GetMultipleDataAsync(clientIds, "ContentItem", ct);
        var schemaMap = new Dictionary<string, SchemaDataDto>(StringComparer.OrdinalIgnoreCase);

        if (schemaDataResult.IsSuccess && schemaDataResult.Value != null)
        {
            foreach (var sd in schemaDataResult.Value)
            {
                if (!string.IsNullOrEmpty(sd.ClientId))
                {
                    schemaMap[sd.ClientId] = sd;
                }
            }
        }

        // 5. Parse requested keys/tags
        var requestedKeys = ExtractKeys(inputs);

        if (requestedKeys.Count == 0)
        {
            // If no specific keys were provided, return ALL items of this ContentType
            foreach (var item in allItems)
            {
                var itemDict = BuildContentItemDict(item, schemaMap.GetValueOrDefault(item.Id.ToString()));
                var key = item.Name;
                foreach (var tagKey in new[] { "material_tag", "material tag", "materialTag", "tag", "key" })
                {
                    if (itemDict.TryGetValue(tagKey, out var matTagObj) && matTagObj is string matTagStr && !string.IsNullOrWhiteSpace(matTagStr))
                    {
                        key = matTagStr.Trim();
                        break;
                    }
                }
                contentMap[key] = itemDict;
                contentIds.Add(item.Id);
            }
        }
        else
        {
            // Specific lookup mode: match each requested key against item Name or schema tag
            foreach (var reqKey in requestedKeys)
            {
                var cleanKey = reqKey.Trim();
                ContentSummaryDto? matched = null;
                Dictionary<string, object?>? matchedDict = null;

                foreach (var item in allItems)
                {
                    var itemDict = BuildContentItemDict(item, schemaMap.GetValueOrDefault(item.Id.ToString()));

                    // Match strategy:
                    // A: Match item.Name
                    // B: Match values["material_tag"], "material tag", "materialTag", "tag", "key"
                    if (string.Equals(item.Name, cleanKey, StringComparison.OrdinalIgnoreCase))
                    {
                        matched = item;
                        matchedDict = itemDict;
                        break;
                    }

                    bool tagMatched = false;
                    foreach (var tagKey in new[] { "material_tag", "material tag", "materialTag", "tag", "key" })
                    {
                        if (itemDict.TryGetValue(tagKey, out var tagVal) && string.Equals(tagVal?.ToString()?.Trim(), cleanKey, StringComparison.OrdinalIgnoreCase))
                        {
                            tagMatched = true;
                            break;
                        }
                    }

                    if (tagMatched)
                    {
                        matched = item;
                        matchedDict = itemDict;
                        break;
                    }
                }

                if (matched != null && matchedDict != null)
                {
                    contentMap[cleanKey] = matchedDict;
                    contentIds.Add(matched.Id);
                }
                else
                {
                    missingKeys.Add(cleanKey);
                }
            }
        }

        logger.LogInformation(
            "LookupContentMap resolved {MatchedCount} items (Missing: {MissingCount}) for Project {ProjectId}",
            contentMap.Count,
            missingKeys.Count,
            projectId
        );

        return new Dictionary<string, object>
        {
            ["ContentMap"] = contentMap,
            ["MissingKeys"] = missingKeys,
            ["ContentIds"] = contentIds
        };
    }

    private static List<string> ExtractKeys(Dictionary<string, object> inputs)
    {
        var raw = inputs.GetValueOrDefault("Keys") ??
                  inputs.GetValueOrDefault("keys") ??
                  inputs.GetValueOrDefault("Names") ??
                  inputs.GetValueOrDefault("names");

        if (raw == null) return [];

        var list = new List<string>();

        if (raw is string str)
        {
            if (str.StartsWith('[') && str.EndsWith(']'))
            {
                try
                {
                    using var doc = JsonDocument.Parse(str);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var el in doc.RootElement.EnumerateArray())
                        {
                            var s = el.GetString();
                            if (!string.IsNullOrWhiteSpace(s)) list.Add(s);
                        }
                        return list;
                    }
                }
                catch { }
            }

            foreach (var part in str.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                list.Add(part);
            }
            return list;
        }

        if (raw is IDictionary dict)
        {
            // If connected from a TagMap or PathToTagMap, extract non-empty values/keys
            foreach (var val in dict.Values)
            {
                if (val != null && !string.IsNullOrWhiteSpace(val.ToString()))
                {
                    list.Add(val.ToString()!);
                }
            }
            return list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        if (raw is IEnumerable enumerable)
        {
            foreach (var item in enumerable)
            {
                if (item != null && !string.IsNullOrWhiteSpace(item.ToString()))
                {
                    list.Add(item.ToString()!);
                }
            }
            return list;
        }

        return list;
    }

    private static Dictionary<string, object?> BuildContentItemDict(
        ContentSummaryDto summary,
        SchemaDataDto? schemaData
    )
    {
        var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["Id"] = summary.Id,
            ["Name"] = summary.Name,
            ["ContentTypeName"] = summary.ContentTypeName,
            ["ContentTypeId"] = summary.ContentTypeId
        };

        if (schemaData?.Values != null)
        {
            var root = schemaData.Values.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in root.EnumerateObject())
                {
                    dict[prop.Name] = ConvertJsonElement(prop.Value);
                }
            }
        }

        return dict;
    }

    private static object? ConvertJsonElement(JsonElement el)
    {
        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString(),
            JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            JsonValueKind.Array => el.EnumerateArray().Select(ConvertJsonElement).ToList(),
            JsonValueKind.Object => el.EnumerateObject().ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value), StringComparer.OrdinalIgnoreCase),
            _ => el.GetRawText()
        };
    }
}
