using System.Text.Json;
using Automation.Content.Contracts;
using Automation.DynamicForms.Contracts;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Deconstruct;

/// <summary>
/// Tool phân rã động bất kỳ ContentItem nào thành các chân cắm (Pins) tương ứng với các trường dữ liệu của ContentType đó.
/// </summary>
public class BreakContentItemTool(
    IContentApi contentApi,
    ISchemaApi schemaApi,
    ILogger<BreakContentItemTool> logger
) : IResolverTool
{
    public string Key => "BreakContentItem";
    public IReadOnlyList<string> Aliases => ["BreakContent", "DeconstructContentItem"];
    public string Label => "Break Content Item";
    public string? Category => "Content & Struct";
    public bool IsPure => true;

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var outputList = new List<PinDefinition>(Outputs);

        if (configValues?.TryGetValue("DynamicPins", out var dpObj) == true && dpObj != null)
        {
            var pinNames = dpObj is IEnumerable<string> strEnum ? strEnum :
                           dpObj is IEnumerable<object> objEnum ? objEnum.Select(x => x.ToString()!) :
                           dpObj is JsonElement jsonEl && jsonEl.ValueKind == JsonValueKind.Array
                               ? jsonEl.EnumerateArray().Select(x => x.GetString()!).Where(x => !string.IsNullOrEmpty(x))
                               : [];

            foreach (var pinName in pinNames)
            {
                if (outputList.Any(p => string.Equals(p.Id, pinName, StringComparison.OrdinalIgnoreCase)))
                    continue;

                var lower = pinName.ToLowerInvariant();
                var cardinality = PinCardinality.Single;
                var primType = PinPrimitiveType.String;

                if (lower.Contains("param") || lower.Contains("map") || lower.Contains("config") || lower.Contains("dict"))
                {
                    cardinality = PinCardinality.Map;
                }
                else if (lower.EndsWith("s") || lower.Contains("list") || lower.Contains("tags") || lower.Contains("array"))
                {
                    cardinality = PinCardinality.Array;
                }

                outputList.Add(new PinDefinition
                {
                    Id = pinName,
                    Label = FormatLabel(pinName),
                    PrimitiveType = primType,
                    Cardinality = cardinality,
                    IsRequired = false
                });
            }
        }

        return (Inputs, outputList);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Target",
            Label = "Content Item",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Metadata = """{"type": "entity-select", "properties": {"entity": "ContentItem"}}"""
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Id",
            Label = "Content Item ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "Name",
            Label = "Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "ContentTypeName",
            Label = "Content Type",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "Values",
            Label = "Values Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        var targetObj = inputs.GetValueOrDefault("Target") ??
                        inputs.GetValueOrDefault("ContentItem") ??
                        inputs.GetValueOrDefault("target") ??
                        inputs.GetValueOrDefault("Id") ??
                        inputs.Values.FirstOrDefault();

        var targetGuid = EntityRefHelper.ExtractRefId(targetObj);
        if (targetGuid == null)
        {
            throw new ArgumentException($"Invalid Target ContentItem EntityRef/GUID format: '{targetObj}'");
        }

        var contentId = targetGuid.Value;
        var result = new Dictionary<string, object>
        {
            ["Id"] = contentId
        };

        // 1. Fetch content summary
        var contentResult = await contentApi.GetContentByIdAsync(contentId, ct);
        if (contentResult.IsSuccess && contentResult.Value != null)
        {
            var summary = contentResult.Value;
            result["Name"] = summary.Name;
            result["ContentTypeName"] = summary.ContentTypeName;
        }

        // 2. Fetch schema values
        var dataResult = await schemaApi.GetDataAsync(contentId.ToString(), "ContentItem", ct);
        var valuesMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (dataResult.IsSuccess && dataResult.Value?.Values != null)
        {
            var root = dataResult.Value.Values.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in root.EnumerateObject())
                {
                    var propName = prop.Name;
                    var propVal = ConvertJsonElement(prop.Value);

                    // Add individual property to result outputs for direct pin binding
                    result[propName] = propVal;

                    // Also accumulate into Values map string representation
                    valuesMap[propName] = prop.Value.ValueKind switch
                    {
                        JsonValueKind.String => prop.Value.GetString() ?? "",
                        _ => prop.Value.GetRawText()
                    };
                }
            }
        }

        result["Values"] = valuesMap;

        logger.LogInformation(
            "BreakContentItem resolved content {Id} ({Name}) with {Count} values: {Keys}",
            contentId,
            result.GetValueOrDefault("Name"),
            valuesMap.Count,
            string.Join(", ", valuesMap.Keys)
        );

        return result;
    }

    private static object ConvertJsonElement(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.String:
                return el.GetString() ?? "";
            case JsonValueKind.Number:
                if (el.TryGetInt64(out var l)) return l;
                return el.GetDouble();
            case JsonValueKind.True:
                return true;
            case JsonValueKind.False:
                return false;
            case JsonValueKind.Object:
                var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var child in el.EnumerateObject())
                {
                    dict[child.Name] = child.Value.ValueKind == JsonValueKind.String
                        ? child.Value.GetString() ?? ""
                        : child.Value.GetRawText();
                }
                return dict;
            case JsonValueKind.Array:
                var list = new List<string>();
                foreach (var item in el.EnumerateArray())
                {
                    list.Add(item.ValueKind == JsonValueKind.String ? item.GetString() ?? "" : item.GetRawText());
                }
                return list.ToArray();
            default:
                return el.GetRawText();
        }
    }

    private static string FormatLabel(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return name;
        var parts = name.Split(new[] { '_', '-', ' ' }, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
    }
}
