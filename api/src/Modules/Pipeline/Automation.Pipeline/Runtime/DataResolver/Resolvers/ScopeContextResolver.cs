using Automation.Pipeline.Runtime.Planner.Models;
namespace Automation.Pipeline.Runtime.DataResolver.Resolvers;

public static class ScopeContextResolver
{
    public static object? ResolveFromScope(ScopeContext? scope, string pinKey)
    {
        if (scope == null || string.IsNullOrWhiteSpace(pinKey))
        {
            return null;
        }

        // Direct lookup
        var val = scope.GetValue(pinKey);
        if (val != null) return val;

        // Normalized lookup
        var normalized = pinKey.Replace(" ", "").Replace("_", "").Replace("-", "");
        if (string.Equals(normalized, "item", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normalized, "value", StringComparison.OrdinalIgnoreCase))
        {
            return scope.GetValue("Value") ?? scope.GetValue("Item");
        }

        if (string.Equals(normalized, "key", StringComparison.OrdinalIgnoreCase))
        {
            return scope.GetValue("Key");
        }

        if (string.Equals(normalized, "index", StringComparison.OrdinalIgnoreCase))
        {
            return scope.GetValue("Index");
        }

        return null;
    }
}
