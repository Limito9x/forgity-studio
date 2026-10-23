using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Engine.StructRegistry.Definitions;

public class DynamicEntityStructDefinition : IEntityStructDefinition
{
    public string StructType { get; }
    public string Label { get; }
    public Guid SchemaDefinitionId { get; }
    public IReadOnlyList<PinDefinition> OutputPins { get; }
    public object? SampleJson { get; }

    public DynamicEntityStructDefinition(
        string structType,
        string label,
        Guid schemaDefinitionId,
        JsonDocument fieldsDoc
    )
    {
        StructType = structType;
        Label = string.IsNullOrWhiteSpace(label) ? structType : label;
        SchemaDefinitionId = schemaDefinitionId;
        OutputPins = ParsePins(fieldsDoc);
        SampleJson = GenerateSampleJson(fieldsDoc);
    }

    private static Dictionary<string, object?> GenerateSampleJson(JsonDocument fieldsDoc)
    {
        var sample = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (fieldsDoc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return sample;
        }

        foreach (var el in fieldsDoc.RootElement.EnumerateArray())
        {
            var name = el.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;
            if (string.IsNullOrWhiteSpace(name)) continue;

            var type = el.TryGetProperty("type", out var tProp) ? tProp.GetString()?.ToLowerInvariant() : "text";

            if (el.TryGetProperty("defaultValue", out var defVal) && defVal.ValueKind != JsonValueKind.Null && defVal.ValueKind != JsonValueKind.Undefined)
            {
                sample[name] = defVal.ValueKind switch
                {
                    JsonValueKind.String => defVal.GetString(),
                    JsonValueKind.Number => defVal.TryGetInt64(out var l) ? l : defVal.GetDouble(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => defVal.ToString()
                };
                continue;
            }

            sample[name] = type switch
            {
                "number" or "numeric" or "integer" => 0,
                "boolean" or "switch" or "checkbox" => true,
                "file-upload" or "image" or "asset" => $"Assets/{name}.png",
                "key-value" or "keyvalue" or "map" => new Dictionary<string, string> { ["sampleKey"] = "sampleValue" },
                "tags" => new[] { "SampleTag" },
                "struct" => Guid.NewGuid().ToString(),
                _ => $"sample_{name}"
            };
        }

        return sample;
    }


    private static IReadOnlyList<PinDefinition> ParsePins(JsonDocument fieldsDoc)
    {
        var pins = new List<PinDefinition>();
        if (fieldsDoc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return pins;
        }

        foreach (var el in fieldsDoc.RootElement.EnumerateArray())
        {
            var name = el.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;
            if (string.IsNullOrWhiteSpace(name)) continue;

            var label = el.TryGetProperty("label", out var lProp) ? lProp.GetString() : name;
            var type = el.TryGetProperty("type", out var tProp) ? tProp.GetString()?.ToLowerInvariant() : "text";

            var primType = type switch
            {
                "number" or "numeric" or "integer" => PinPrimitiveType.Number,
                "boolean" or "switch" or "checkbox" => PinPrimitiveType.Boolean,
                "file-upload" or "image" or "asset" => PinPrimitiveType.String,
                "struct" => PinPrimitiveType.EntityRef,
                _ => PinPrimitiveType.String
            };

            var cardinality = PinCardinality.Single;
            if (string.Equals(type, "key-value", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(type, "keyvalue", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(type, "map", StringComparison.OrdinalIgnoreCase))
            {
                cardinality = PinCardinality.Map;
            }
            else if (string.Equals(type, "tags", StringComparison.OrdinalIgnoreCase))
            {
                cardinality = PinCardinality.Array;
            }
            else if (el.TryGetProperty("properties", out var propsEl) &&
                propsEl.ValueKind == JsonValueKind.Object &&
                propsEl.TryGetProperty("cardinality", out var cardEl))
            {
                var cardStr = cardEl.GetString();
                if (string.Equals(cardStr, "array", StringComparison.OrdinalIgnoreCase))
                    cardinality = PinCardinality.Array;
                else if (string.Equals(cardStr, "map", StringComparison.OrdinalIgnoreCase))
                    cardinality = PinCardinality.Map;
            }

            pins.Add(new PinDefinition
            {
                Id = name,
                Label = label ?? name,
                Kind = PinKind.Data,
                PrimitiveType = primType,
                Cardinality = cardinality
            });
        }

        return pins;
    }

    public Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        if (targetInput is JsonElement jsonEl)
        {
            if (jsonEl.ValueKind == JsonValueKind.Object)
            {
                foreach (var pin in OutputPins)
                {
                    if (jsonEl.TryGetProperty(pin.Id, out var val))
                    {
                        result[pin.Id] = ConvertJsonElement(val);
                    }
                }
            }
        }
        else if (targetInput is IDictionary<string, object?> dict)
        {
            foreach (var pin in OutputPins)
            {
                if (dict.TryGetValue(pin.Id, out var val) && val != null)
                {
                    result[pin.Id] = val;
                }
            }
        }
        else if (targetInput is string jsonStr && !string.IsNullOrWhiteSpace(jsonStr))
        {
            try
            {
                using var doc = JsonDocument.Parse(jsonStr);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var pin in OutputPins)
                    {
                        if (doc.RootElement.TryGetProperty(pin.Id, out var val))
                        {
                            result[pin.Id] = ConvertJsonElement(val);
                        }
                    }
                }
            }
            catch
            {
                // Fallback: không parse được json
            }
        }

        return Task.FromResult(result);
    }

    private static object ConvertJsonElement(JsonElement el)
    {
        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString() ?? string.Empty,
            JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null or JsonValueKind.Undefined => string.Empty,
            _ => el.Clone()
        };
    }
}
