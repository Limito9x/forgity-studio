using System.Text.Json;
namespace Automation.Pipeline.Runtime.DataResolver.Resolvers;

public static class InlineConfigResolver
{
    public static object? ResolveFromConfig(JsonDocument? config, string pinKey)
    {
        if (config == null || string.IsNullOrWhiteSpace(pinKey) || config.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var normalizedTarget = NormalizeKey(pinKey);

        foreach (var prop in config.RootElement.EnumerateObject())
        {
            if (string.Equals(prop.Name, pinKey, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(NormalizeKey(prop.Name), normalizedTarget, StringComparison.OrdinalIgnoreCase))
            {
                return NormalizeJsonElement(prop.Value);
            }
        }

        return null;
    }

    private static string NormalizeKey(string key)
    {
        return key.Replace(" ", "").Replace("_", "").Replace("-", "");
    }

    public static object? NormalizeJsonElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Array => element.EnumerateArray().Select(NormalizeJsonElement).Where(x => x != null).ToArray(),
            JsonValueKind.Object => JsonSerializer.Deserialize<Dictionary<string, object?>>(element.GetRawText()),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _ => element.GetRawText()
        };
    }
}
