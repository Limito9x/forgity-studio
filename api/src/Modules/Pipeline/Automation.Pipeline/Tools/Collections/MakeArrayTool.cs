using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Collections;

public class MakeArrayTool : IResolverTool
{
    public string Key => "MakeArray";
    public string Label => "Make Array";
    public string? Category => "Collections";
    public bool IsPure => true;
    public bool IsDynamic => true;

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        if (configValues?.TryGetValue("DynamicPins", out var dpObj) == true && dpObj != null)
        {
            var pinNames = dpObj is IEnumerable<string> strEnum ? strEnum :
                           dpObj is IEnumerable<object> objEnum ? objEnum.Select(x => x.ToString()!) :
                           dpObj is JsonElement jsonEl && jsonEl.ValueKind == JsonValueKind.Array
                               ? jsonEl.EnumerateArray().Select(x => x.GetString()!).Where(x => !string.IsNullOrEmpty(x))
                               : [];

            var dynamicList = pinNames.Select(pinId => new PinDefinition
            {
                Id = pinId,
                Label = pinId.StartsWith("Item_") ? pinId.Replace("_", " ") : pinId,
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = false
            }).ToList();

            if (dynamicList.Count > 0)
            {
                return (dynamicList, Outputs);
            }
        }

        return (Inputs, Outputs);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Items",
            Label = "Items",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array,
            IsRequired = true,
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Result",
            Label = "Result",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array,
            IsRequired = true,
        }
    ];

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var resultList = new List<string>();

        void AppendValue(object? rawItem)
        {
            if (rawItem == null) return;

            if (rawItem is IEnumerable<string> strEnumerable)
            {
                resultList.AddRange(strEnumerable.Where(x => !string.IsNullOrEmpty(x)));
            }
            else if (rawItem is string strSingle)
            {
                if (!string.IsNullOrEmpty(strSingle))
                    resultList.Add(strSingle);
            }
            else if (rawItem is JsonElement jsonElement)
            {
                if (jsonElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in jsonElement.EnumerateArray())
                    {
                        var val = item.GetString() ?? item.GetRawText();
                        if (!string.IsNullOrEmpty(val))
                            resultList.Add(val);
                    }
                }
                else if (jsonElement.ValueKind == JsonValueKind.String)
                {
                    var val = jsonElement.GetString();
                    if (!string.IsNullOrEmpty(val))
                        resultList.Add(val);
                }
                else
                {
                    var raw = jsonElement.GetRawText();
                    if (!string.IsNullOrEmpty(raw))
                        resultList.Add(raw);
                }
            }
            else if (rawItem is IEnumerable enumerable)
            {
                foreach (var item in enumerable)
                {
                    if (item != null)
                    {
                        var str = item.ToString();
                        if (!string.IsNullOrEmpty(str))
                            resultList.Add(str);
                    }
                }
            }
            else
            {
                var str = rawItem.ToString();
                if (!string.IsNullOrEmpty(str))
                    resultList.Add(str);
            }
        }

        // Sắp xếp các pins để giữ đúng thứ tự: "Items" -> "Item_1", "Item_2", ...
        var orderedKeys = inputs.Keys
            .Where(k => !string.Equals(k, "DynamicPins", StringComparison.OrdinalIgnoreCase))
            .OrderBy(k =>
            {
                if (string.Equals(k, "Items", StringComparison.OrdinalIgnoreCase)) return 0;
                if (k.StartsWith("Item_", StringComparison.OrdinalIgnoreCase) && int.TryParse(k.Substring(5), out var idx))
                    return idx;
                if (k.StartsWith("Item ", StringComparison.OrdinalIgnoreCase) && int.TryParse(k.Substring(5), out var idx2))
                    return idx2;
                return 1000;
            }).ToList();

        foreach (var key in orderedKeys)
        {
            AppendValue(inputs[key]);
        }

        var result = new Dictionary<string, object>
        {
            ["Result"] = resultList.ToArray()
        };

        return Task.FromResult(result);
    }
}
