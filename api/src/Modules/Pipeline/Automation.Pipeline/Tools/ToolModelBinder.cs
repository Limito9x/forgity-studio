using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools;

public static class ToolModelBinder
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public static T Bind<T>(IDictionary rawInputs) where T : class, new()
    {
        return (T)Bind(typeof(T), rawInputs);
    }

    public static object Bind(Type targetType, IDictionary rawInputs)
    {
        var instance = Activator.CreateInstance(targetType)
                       ?? throw new InvalidOperationException($"Unable to create instance of type {targetType.FullName}");

        var properties = targetType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanWrite && p.GetCustomAttribute<ToolPinIgnoreAttribute>() == null);

        foreach (var prop in properties)
        {
            var attr = prop.GetCustomAttribute<ToolPinAttribute>();
            var pinId = attr?.Id ?? prop.Name;

            if (TryFindValue(rawInputs, pinId, out var rawVal) && rawVal != null)
            {
                var converted = ConvertValue(rawVal, prop.PropertyType);
                if (converted != null || !prop.PropertyType.IsValueType || Nullable.GetUnderlyingType(prop.PropertyType) != null)
                {
                    prop.SetValue(instance, converted);
                }
            }
        }

        return instance;
    }

    public static Dictionary<string, object> ToDictionary<T>(T output) where T : class
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        if (output is IDictionary<string, object> dict)
        {
            foreach (var (k, v) in dict)
            {
                if (v != null) result[k] = v;
            }
            return result;
        }

        var properties = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanRead && p.GetCustomAttribute<ToolPinIgnoreAttribute>() == null);

        foreach (var prop in properties)
        {
            var attr = prop.GetCustomAttribute<ToolPinAttribute>();
            var pinId = attr?.Id ?? prop.Name;
            var val = prop.GetValue(output);
            if (val != null)
            {
                result[pinId] = val;
            }
        }

        return result;
    }

    public static IReadOnlyList<PinDefinition> InferPins(Type modelType, PinKind defaultKind = PinKind.Data)
    {
        var pins = new List<PinDefinition>();
        var properties = modelType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.GetCustomAttribute<ToolPinIgnoreAttribute>() == null);

        foreach (var prop in properties)
        {
            var attr = prop.GetCustomAttribute<ToolPinAttribute>();
            var pinId = attr?.Id ?? prop.Name;
            var label = attr?.Label ?? ToDisplayName(prop.Name);
            var kind = attr?.Kind ?? defaultKind;

            var (primType, cardinality) = InferTypeAndCardinality(prop.PropertyType);

            if (attr != null && attr.HasPrimitiveType) primType = attr.PrimitiveType;
            if (attr != null && attr.HasCardinality) cardinality = attr.Cardinality;

            pins.Add(new PinDefinition
            {
                Id = pinId,
                Label = label,
                Kind = kind,
                PrimitiveType = primType,
                Cardinality = cardinality,
                IsRequired = attr?.IsRequired ?? (Nullable.GetUnderlyingType(prop.PropertyType) == null && prop.PropertyType.IsValueType),
                DefaultValue = attr?.DefaultValue,
                Metadata = attr?.Metadata,
                EntityTarget = attr?.EntityTarget,
                AllowedExtensions = attr?.AllowedExtensions
            });
        }

        return pins;
    }

    private static (PinPrimitiveType Primitive, PinCardinality Cardinality) InferTypeAndCardinality(Type type)
    {
        var unwrapped = Nullable.GetUnderlyingType(type) ?? type;

        if (unwrapped == typeof(string))
            return (PinPrimitiveType.String, PinCardinality.Single);

        if (unwrapped == typeof(int) || unwrapped == typeof(long) || unwrapped == typeof(double) ||
            unwrapped == typeof(float) || unwrapped == typeof(decimal) || unwrapped == typeof(short))
            return (PinPrimitiveType.Number, PinCardinality.Single);

        if (unwrapped == typeof(bool))
            return (PinPrimitiveType.Boolean, PinCardinality.Single);

        if (unwrapped == typeof(Guid))
            return (PinPrimitiveType.EntityRef, PinCardinality.Single);

        // Dictionary / Map
        if (typeof(IDictionary).IsAssignableFrom(unwrapped) ||
            (unwrapped.IsGenericType && unwrapped.GetGenericTypeDefinition() == typeof(IDictionary<,>)) ||
            (unwrapped.IsGenericType && unwrapped.GetGenericTypeDefinition() == typeof(Dictionary<,>)))
        {
            return (PinPrimitiveType.String, PinCardinality.Map);
        }

        // Array / List
        if (unwrapped.IsArray)
        {
            var elemType = unwrapped.GetElementType() ?? typeof(object);
            var (innerPrim, _) = InferTypeAndCardinality(elemType);
            return (innerPrim, PinCardinality.Array);
        }

        if (typeof(IEnumerable).IsAssignableFrom(unwrapped) && unwrapped.IsGenericType)
        {
            var elemType = unwrapped.GetGenericArguments().FirstOrDefault() ?? typeof(object);
            var (innerPrim, _) = InferTypeAndCardinality(elemType);
            return (innerPrim, PinCardinality.Array);
        }

        return (PinPrimitiveType.String, PinCardinality.Single);
    }

    private static bool TryFindValue(IDictionary inputs, string targetKey, out object? value)
    {
        if (inputs.Contains(targetKey))
        {
            value = inputs[targetKey];
            return true;
        }

        var normalized = NormalizeKey(targetKey);
        foreach (DictionaryEntry entry in inputs)
        {
            var k = entry.Key?.ToString();
            if (k != null && string.Equals(NormalizeKey(k), normalized, StringComparison.OrdinalIgnoreCase))
            {
                value = entry.Value;
                return true;
            }
        }

        value = null;
        return false;
    }

    private static string NormalizeKey(string key)
    {
        return key.Replace("_", "").Replace("-", "").Replace(" ", "");
    }

    private static object? ConvertValue(object raw, Type targetType)
    {
        var unwrapped = Nullable.GetUnderlyingType(targetType) ?? targetType;

        if (raw == null) return null;

        if (unwrapped.IsInstanceOfType(raw))
        {
            return raw;
        }

        // Handle JsonElement
        if (raw is JsonElement je)
        {
            return ConvertJsonElement(je, unwrapped);
        }

        // Handle String
        if (unwrapped == typeof(string))
        {
            return raw.ToString();
        }

        // Handle Guid
        if (unwrapped == typeof(Guid))
        {
            if (raw is Guid g) return g;
            if (Guid.TryParse(raw.ToString(), out var parsedG)) return parsedG;
            return Guid.Empty;
        }

        // Handle Boolean
        if (unwrapped == typeof(bool))
        {
            if (raw is bool b) return b;
            var str = raw.ToString()?.Trim();
            if (bool.TryParse(str, out var pb)) return pb;
            if (str == "1") return true;
            if (str == "0") return false;
            return false;
        }

        // Handle Numbers
        if (unwrapped == typeof(int)) return Convert.ToInt32(raw, CultureInfo.InvariantCulture);
        if (unwrapped == typeof(long)) return Convert.ToInt64(raw, CultureInfo.InvariantCulture);
        if (unwrapped == typeof(double)) return Convert.ToDouble(raw, CultureInfo.InvariantCulture);
        if (unwrapped == typeof(float)) return Convert.ToSingle(raw, CultureInfo.InvariantCulture);
        if (unwrapped == typeof(decimal)) return Convert.ToDecimal(raw, CultureInfo.InvariantCulture);

        // Handle Enum
        if (unwrapped.IsEnum)
        {
            if (raw is string strEnum && Enum.TryParse(unwrapped, strEnum, true, out var enumVal))
            {
                return enumVal;
            }
            return Enum.ToObject(unwrapped, raw);
        }

        // Handle Dictionary / Map
        if (typeof(IDictionary).IsAssignableFrom(unwrapped) ||
            (unwrapped.IsGenericType && unwrapped.GetGenericTypeDefinition() == typeof(Dictionary<,>)))
        {
            return ConvertToDictionary(raw, unwrapped);
        }

        // Handle List / Array
        if (typeof(IEnumerable).IsAssignableFrom(unwrapped) && unwrapped != typeof(string))
        {
            return ConvertToListOrArray(raw, unwrapped);
        }

        // If raw is a JSON string, try deserializing to targetType
        if (raw is string jsonCandidate && (jsonCandidate.TrimStart().StartsWith('{') || jsonCandidate.TrimStart().StartsWith('[')))
        {
            try
            {
                return JsonSerializer.Deserialize(jsonCandidate, unwrapped, JsonOptions);
            }
            catch
            {
                // Fallback to default
            }
        }

        try
        {
            return Convert.ChangeType(raw, unwrapped, CultureInfo.InvariantCulture);
        }
        catch
        {
            return null;
        }
    }

    private static object? ConvertJsonElement(JsonElement je, Type targetType)
    {
        return je.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            JsonValueKind.True when targetType == typeof(bool) => true,
            JsonValueKind.False when targetType == typeof(bool) => false,
            JsonValueKind.String when targetType == typeof(string) => je.GetString(),
            JsonValueKind.String when targetType == typeof(Guid) && Guid.TryParse(je.GetString(), out var g) => g,
            JsonValueKind.Number when targetType == typeof(int) => je.GetInt32(),
            JsonValueKind.Number when targetType == typeof(long) => je.GetInt64(),
            JsonValueKind.Number when targetType == typeof(double) => je.GetDouble(),
            JsonValueKind.Number when targetType == typeof(float) => (float)je.GetDouble(),
            _ => JsonSerializer.Deserialize(je.GetRawText(), targetType, JsonOptions)
        };
    }

    private static object? ConvertToDictionary(object raw, Type targetDictType)
    {
        var keyType = targetDictType.IsGenericType ? targetDictType.GetGenericArguments()[0] : typeof(string);
        var valType = targetDictType.IsGenericType ? targetDictType.GetGenericArguments()[1] : typeof(object);

        var concreteType = typeof(Dictionary<,>).MakeGenericType(keyType, valType);
        var dict = (IDictionary)Activator.CreateInstance(concreteType)!;

        if (raw is IDictionary sourceDict)
        {
            foreach (DictionaryEntry entry in sourceDict)
            {
                var k = ConvertValue(entry.Key, keyType);
                var v = entry.Value != null ? ConvertValue(entry.Value, valType) : null;
                if (k != null) dict[k] = v;
            }
            return dict;
        }

        if (raw is JsonElement je && je.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in je.EnumerateObject())
            {
                var k = ConvertValue(prop.Name, keyType);
                var v = ConvertValue(prop.Value, valType);
                if (k != null) dict[k] = v;
            }
            return dict;
        }

        if (raw is string json && json.TrimStart().StartsWith('{'))
        {
            try
            {
                return JsonSerializer.Deserialize(json, targetDictType, JsonOptions);
            }
            catch { }
        }

        return dict;
    }

    private static object? ConvertToListOrArray(object raw, Type targetListType)
    {
        var elemType = targetListType.IsArray
            ? targetListType.GetElementType()!
            : targetListType.GetGenericArguments().FirstOrDefault() ?? typeof(object);

        var listType = typeof(List<>).MakeGenericType(elemType);
        var list = (IList)Activator.CreateInstance(listType)!;

        if (raw is IEnumerable enumerable and not string and not IDictionary)
        {
            foreach (var item in enumerable)
            {
                list.Add(item != null ? ConvertValue(item, elemType) : null);
            }
        }
        else if (raw is JsonElement je && je.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in je.EnumerateArray())
            {
                list.Add(ConvertJsonElement(item, elemType));
            }
        }
        else if (raw is string json && json.TrimStart().StartsWith('['))
        {
            try
            {
                var deserialized = JsonSerializer.Deserialize(json, listType, JsonOptions);
                if (deserialized is IList dList) return targetListType.IsArray ? ToArray(dList, elemType) : dList;
            }
            catch { }
        }
        else
        {
            // Single value wrapped into list
            list.Add(ConvertValue(raw, elemType));
        }

        return targetListType.IsArray ? ToArray(list, elemType) : list;
    }

    private static Array ToArray(IList list, Type elemType)
    {
        var arr = Array.CreateInstance(elemType, list.Count);
        list.CopyTo(arr, 0);
        return arr;
    }

    private static string ToDisplayName(string propertyName)
    {
        if (string.IsNullOrEmpty(propertyName)) return propertyName;
        // Turn "BaseDir" -> "Base Dir"
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < propertyName.Length; i++)
        {
            if (i > 0 && char.IsUpper(propertyName[i]) && !char.IsUpper(propertyName[i - 1]))
            {
                sb.Append(' ');
            }
            sb.Append(propertyName[i]);
        }
        return sb.ToString();
    }
}
