using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Engine.DataResolver;

/// <summary>
/// Bộ ép kiểu và chuẩn hóa dữ liệu Pin tập trung (Pin Type Coercer).
/// Chuyển đổi an toàn giữa JsonElement, IDictionary, List, string JSON và primitive types
/// dựa trên PinDefinition (Cardinality & PrimitiveType).
/// </summary>
public static class PinTypeCoercer
{
    /// <summary>
    /// Chuẩn hóa và ép kiểu resolvedValue theo định nghĩa PinDefinition.
    /// </summary>
    public static object? Coerce(object? value, PinDefinition? pinDef)
    {
        if (value == null || pinDef == null) return value;

        return pinDef.Cardinality switch
        {
            PinCardinality.Array => CoerceToArray(value, pinDef.PrimitiveType),
            PinCardinality.Map => CoerceToMap(value),
            PinCardinality.Single => CoerceToSingle(value, pinDef.PrimitiveType),
            _ => value
        };
    }

    /// <summary>
    /// Ép kiểu dữ liệu sang cấu trúc Map (Dictionary&lt;string, object?&gt;).
    /// </summary>
    public static object? CoerceToMap(object value)
    {
        if (value is Dictionary<string, object?> dictStrObj)
        {
            return dictStrObj;
        }

        if (value is IDictionary dict)
        {
            var res = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (DictionaryEntry entry in dict)
            {
                if (entry.Key != null)
                {
                    res[entry.Key.ToString()!] = entry.Value is JsonElement je ? ConvertJsonElement(je) : entry.Value;
                }
            }
            return res;
        }

        if (value is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Object)
        {
            var res = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in jsonElem.EnumerateObject())
            {
                res[prop.Name] = ConvertJsonElement(prop.Value);
            }
            return res;
        }

        if (value is string jsonStr && jsonStr.TrimStart().StartsWith('{'))
        {
            try
            {
                using var doc = JsonDocument.Parse(jsonStr);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    return CoerceToMap(doc.RootElement);
                }
            }
            catch
            {
                // Fallback: giữ nguyên value
            }
        }

        return value;
    }

    /// <summary>
    /// Ép kiểu dữ liệu sang cấu trúc mảng (Array / List&lt;object?&gt;).
    /// </summary>
    public static object? CoerceToArray(object value, PinPrimitiveType? innerType = null)
    {
        if (value is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Array)
        {
            var list = new List<object?>();
            foreach (var item in jsonElem.EnumerateArray())
            {
                list.Add(ConvertJsonElement(item));
            }
            return list;
        }

        if (value is string arrJson && arrJson.TrimStart().StartsWith('['))
        {
            try
            {
                using var doc = JsonDocument.Parse(arrJson);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    return CoerceToArray(doc.RootElement, innerType);
                }
            }
            catch
            {
                // Fallback: giữ nguyên
            }
        }

        if (value is Array || value is IList)
        {
            return value;
        }

        // Single value boxed into array
        return new[] { value };
    }

    /// <summary>
    /// Ép kiểu dữ liệu dạng Single (unboxing JsonElement sang native C# types).
    /// </summary>
    public static object? CoerceToSingle(object value, PinPrimitiveType primitiveType)
    {
        if (value is JsonElement je)
        {
            return ConvertJsonElement(je);
        }

        return value;
    }

    /// <summary>
    /// Chuyển đổi một JsonElement sang native C# type tương ứng.
    /// </summary>
    public static object? ConvertJsonElement(JsonElement je)
    {
        return je.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => je.GetString(),
            JsonValueKind.Number => je.TryGetInt64(out var l) ? l : je.GetDouble(),
            JsonValueKind.Array => je.EnumerateArray().Select(ConvertJsonElement).ToList(),
            JsonValueKind.Object => je.EnumerateObject().ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value), StringComparer.OrdinalIgnoreCase),
            _ => je.GetRawText()
        };
    }
}
