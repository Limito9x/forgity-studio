using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Collections;

/// <summary>
/// Tool khởi tạo Map (Make Map) tương tự node Make Map trong Unreal Engine Blueprint.
/// Cho phép tạo Map rỗng hoặc nhập các cặp [Key, Value] cố định.
/// </summary>
public class MakeMapTool : IResolverTool
{
    public string Key => "MakeMap";
    public string Label => "Make Map";
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
                Label = pinId.StartsWith("Key_") || pinId.StartsWith("Value_") ? pinId.Replace("_", " ") : pinId,
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
            Id = "Key_0",
            Label = "Key 0",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        },
        new()
        {
            Id = "Value_0",
            Label = "Value 0",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Result",
            Label = "Result",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = true
        }
    ];

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var map = new Dictionary<string, string>();

        var keyPins = inputs.Keys.Where(k => k.StartsWith("Key_", StringComparison.OrdinalIgnoreCase)).ToList();
        foreach (var keyPin in keyPins)
        {
            var suffix = keyPin[4..];
            var valPin = inputs.Keys.FirstOrDefault(k => string.Equals(k, $"Value_{suffix}", StringComparison.OrdinalIgnoreCase));
            
            var keyStr = inputs[keyPin]?.ToString();
            var valStr = valPin != null ? inputs[valPin]?.ToString() ?? string.Empty : string.Empty;

            if (!string.IsNullOrEmpty(keyStr))
            {
                map[keyStr] = valStr;
            }
        }

        return Task.FromResult(new Dictionary<string, object>
        {
            ["Result"] = map,
            ["Map"] = map
        });
    }
}
