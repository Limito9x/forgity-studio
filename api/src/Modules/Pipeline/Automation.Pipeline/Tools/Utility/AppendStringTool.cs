using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Utility;

/// <summary>
/// Tool nối 2 chuỗi dạng generic tương tự node Append (String) trong Unreal Engine (A + B).
/// </summary>
public class AppendStringTool : IResolverTool
{
    public string Key => "AppendString";
    public string Label => "Append String";
    public string? Category => "Utility";
    public bool IsPure => true;

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
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "A",
                Label = "A",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = false,
                DefaultValue = "",
            },
            new PinDefinition
            {
                Id = "B",
                Label = "B",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = false,
                DefaultValue = "",
            }
        };

    public IReadOnlyList<PinDefinition> Outputs =>
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "Result",
                Label = "Result",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = true,
            }
        };

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        // Lấy tất cả các input và sắp xếp theo thứ tự (A, B, C, D...)
        var orderedValues = inputs
            .OrderBy(k => k.Key, StringComparer.OrdinalIgnoreCase)
            .Select(k => k.Value?.ToString() ?? string.Empty)
            .ToList();

        var result = orderedValues.Count switch
        {
            0 => string.Empty,
            1 => orderedValues[0],
            _ => string.Concat(orderedValues)
        };

        return Task.FromResult(new Dictionary<string, object>
        {
            ["Result"] = result
        });
    }
}
