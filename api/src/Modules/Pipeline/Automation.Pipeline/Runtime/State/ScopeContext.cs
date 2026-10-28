namespace Automation.Pipeline.Runtime.State;

public class ScopeContext
{
    public string ScopeId { get; init; } = "root";
    public ScopeContext? ParentScope { get; init; }
    public int? IterationIndex { get; init; }
    public Dictionary<string, object?> ScopeValues { get; init; } = new(StringComparer.OrdinalIgnoreCase);

    public ScopeContext() { }

    public ScopeContext(string scopeId, ScopeContext? parentScope = null, int? iterationIndex = null)
    {
        ScopeId = scopeId;
        ParentScope = parentScope;
        IterationIndex = iterationIndex;
    }

    public ScopeContext BuildChildScope(string childScopeId, int? iterationIndex = null)
    {
        return new ScopeContext(childScopeId, this, iterationIndex);
    }

    public object? GetValue(string key)
    {
        if (ScopeValues.TryGetValue(key, out var val) && val != null)
        {
            return val;
        }

        return ParentScope?.GetValue(key);
    }

    public void SetValue(string key, object? value)
    {
        ScopeValues[key] = value;
    }

    /// <summary>
    /// Sinh chuỗi path đại diện cho toàn bộ phân cấp scope:
    /// Ví dụ: scope:outer:iter:0:scope:inner:iter:2
    /// </summary>
    public string GetScopePath()
    {
        var parts = new List<string>();
        CollectScopeParts(this, parts);
        return string.Join(":", parts);
    }

    private static void CollectScopeParts(ScopeContext? current, List<string> parts)
    {
        if (current == null || string.Equals(current.ScopeId, "root", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (current.ParentScope != null)
        {
            CollectScopeParts(current.ParentScope, parts);
        }

        parts.Add($"scope:{current.ScopeId}");
        if (current.IterationIndex.HasValue)
        {
            parts.Add($"iter:{current.IterationIndex.Value}");
        }
    }
}
