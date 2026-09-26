using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;

namespace Automation.Pipeline.Tools.Construct;

/// <summary>
/// Tool ép kiểu đối tượng/JSON thô thành Dynamic Struct theo Schema (Data Adapter / Type Coercion).
/// Khớp trường linh hoạt (case-insensitive, snake_case, PascalCase) và mở sẵn các chân Pins để nối dây.
/// </summary>
public class CastToStructTool(IEntityStructRegistry structRegistry) : IResolverTool
{
    public string Key => "CastToStruct";
    public IReadOnlyList<string> Aliases => ["CastStruct", "AsStruct", "AdaptToStruct"];
    public string Label => "Cast To Struct";
    public string? Category => "Data / Struct";
    public bool IsPure => true;

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var structType = configValues?.GetValueOrDefault("StructType")?.ToString();
        var registry = context?.StructRegistry ?? structRegistry;

        if (!string.IsNullOrWhiteSpace(structType) && registry?.Get(structType, context?.ProjectId) is { } sDef)
        {
            var dynamicInputs = new List<PinDefinition>
            {
                new()
                {
                    Id = "Source",
                    Label = "Source Object",
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.String,
                    Cardinality = PinCardinality.Map,
                    IsRequired = true
                },
                new()
                {
                    Id = "StructType",
                    Label = "Struct Type",
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.String,
                    Cardinality = PinCardinality.Single,
                    IsRequired = false,
                    DefaultValue = structType
                }
            };

            var dynamicOutputs = new List<PinDefinition>
            {
                new()
                {
                    Id = "Result",
                    Label = sDef.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.EntityRef,
                    Cardinality = PinCardinality.Single,
                    Metadata = structType
                },
                new()
                {
                    Id = "IsValid",
                    Label = "Is Valid",
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.Boolean,
                    Cardinality = PinCardinality.Single
                }
            };

            // Nở ra toàn bộ các chân trường của Struct để người dùng có thể nối dây trực tiếp
            foreach (var pin in sDef.OutputPins)
            {
                dynamicOutputs.Add(new PinDefinition
                {
                    Id = pin.Id,
                    Label = pin.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = pin.PrimitiveType,
                    Cardinality = pin.Cardinality,
                    IsRequired = false,
                    Metadata = pin.Metadata
                });
            }

            return (dynamicInputs, dynamicOutputs);
        }

        return (Inputs, Outputs);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Source",
            Label = "Source Object",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = true
        },
        new()
        {
            Id = "StructType",
            Label = "Struct Type",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            DefaultValue = "Resource"
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Result",
            Label = "Struct",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "IsValid",
            Label = "Is Valid",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var sourceObj = inputs.GetValueOrDefault("Source") ?? inputs.GetValueOrDefault("source");
        var structType = inputs.TryGetValue("StructType", out var stVal) && stVal != null
            ? stVal.ToString()?.Trim()
            : null;

        if (string.IsNullOrWhiteSpace(structType))
        {
            structType = "Resource";
        }

        var sDef = structRegistry.Get(structType, context?.ProjectId);
        if (sDef == null)
        {
            throw new InvalidOperationException($"Struct Type '{structType}' is not registered.");
        }

        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        if (sourceObj == null)
        {
            result["Result"] = new Dictionary<string, object?> { ["$type"] = structType };
            result["IsValid"] = false;
            return result;
        }

        // Chuyển sourceObj về Dictionary các cặp key-value chuẩn hóa
        var sourceDict = ExtractSourceDictionary(sourceObj);

        // Với mỗi Pin trong Struct, tra cứu giá trị theo cơ chế đối chiếu linh hoạt
        var packed = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["$type"] = structType
        };

        foreach (var pin in sDef.OutputPins)
        {
            if (TryFindMatchingValue(sourceDict, pin.Id, out var val))
            {
                var coerced = CoerceValue(val, pin.PrimitiveType, pin.Cardinality);
                result[pin.Id] = coerced;
                packed[pin.Id] = coerced;
            }
            else
            {
                var def = GetDefaultValue(pin.PrimitiveType, pin.Cardinality);
                result[pin.Id] = def;
                packed[pin.Id] = def;
            }
        }

        result["Result"] = packed;
        result["IsValid"] = true;

        return result;
    }

    private static Dictionary<string, object?> ExtractSourceDictionary(object source)
    {
        var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        if (source is JsonElement je)
        {
            if (je.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in je.EnumerateObject())
                {
                    dict[prop.Name] = ConvertJsonElement(prop.Value);
                }
            }
        }
        else if (source is JsonDocument jd)
        {
            if (jd.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in jd.RootElement.EnumerateObject())
                {
                    dict[prop.Name] = ConvertJsonElement(prop.Value);
                }
            }
        }
        else if (source is IDictionary<string, object?> dObj)
        {
            foreach (var (k, v) in dObj) dict[k] = v;
        }
        else if (source is IDictionary dNonGeneric)
        {
            foreach (DictionaryEntry de in dNonGeneric)
            {
                if (de.Key != null)
                {
                    dict[de.Key.ToString()!] = de.Value;
                }
            }
        }
        else if (source is string str && !string.IsNullOrWhiteSpace(str))
        {
            var trimmed = str.Trim();
            if (trimmed.StartsWith('{') && trimmed.EndsWith('}'))
            {
                try
                {
                    using var doc = JsonDocument.Parse(trimmed);
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        dict[prop.Name] = ConvertJsonElement(prop.Value);
                    }
                }
                catch { }
            }
        }

        return dict;
    }

    private static bool TryFindMatchingValue(
        Dictionary<string, object?> sourceDict,
        string targetKey,
        out object? value
    )
    {
        // 1. Direct match (case-insensitive do StringComparer.OrdinalIgnoreCase)
        if (sourceDict.TryGetValue(targetKey, out value))
        {
            return true;
        }

        // 2. Normalized match (strip underscores, hyphens, and lowercase)
        var normTarget = NormalizeKey(targetKey);
        foreach (var (k, v) in sourceDict)
        {
            if (NormalizeKey(k) == normTarget)
            {
                value = v;
                return true;
            }
        }

        value = null;
        return false;
    }

    private static string NormalizeKey(string key)
    {
        return key.Replace("_", string.Empty)
                  .Replace("-", string.Empty)
                  .Replace(" ", string.Empty)
                  .ToLowerInvariant();
    }

    private static object CoerceValue(object? val, PinPrimitiveType primType, PinCardinality cardinality)
    {
        if (val == null)
        {
            return GetDefaultValue(primType, cardinality);
        }

        if (cardinality == PinCardinality.Array)
        {
            if (val is IEnumerable en and not string and not IDictionary)
            {
                var list = new List<object>();
                foreach (var item in en)
                {
                    if (item != null) list.Add(item);
                }
                return list;
            }

            return new List<object> { val };
        }

        if (cardinality == PinCardinality.Map)
        {
            if (val is IDictionary<string, object?> d) return d;
            if (val is JsonElement je && je.ValueKind == JsonValueKind.Object)
            {
                var map = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                foreach (var prop in je.EnumerateObject())
                {
                    map[prop.Name] = ConvertJsonElement(prop.Value);
                }
                return map;
            }
            return new Dictionary<string, object?>();
        }

        return primType switch
        {
            PinPrimitiveType.Number => val switch
            {
                int i => i,
                long l => l,
                double d => d,
                float f => f,
                decimal dec => dec,
                string s => double.TryParse(s, out var num) ? num : 0,
                _ => 0
            },
            PinPrimitiveType.Boolean => val switch
            {
                bool b => b,
                string s => bool.TryParse(s, out var bParsed) && bParsed,
                int i => i != 0,
                _ => false
            },
            _ => val is string s ? s : val.ToString() ?? string.Empty
        };
    }

    private static object GetDefaultValue(PinPrimitiveType primType, PinCardinality cardinality)
    {
        if (cardinality == PinCardinality.Array) return new List<object>();
        if (cardinality == PinCardinality.Map) return new Dictionary<string, object?>();

        return primType switch
        {
            PinPrimitiveType.Number => 0,
            PinPrimitiveType.Boolean => false,
            _ => string.Empty
        };
    }

    private static object? ConvertJsonElement(JsonElement el)
    {
        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString(),
            JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            JsonValueKind.Array => el.EnumerateArray().Select(ConvertJsonElement).ToList(),
            JsonValueKind.Object => el.EnumerateObject().ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value)),
            _ => el.GetRawText()
        };
    }
}
