using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class GetMapItemInputs
{
    [ToolPin(Id = "Map", Label = "Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = true)]
    public Dictionary<string, object?> Map { get; set; } = [];

    [ToolPin(Id = "Key", Label = "Key", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Single, IsRequired = true)]
    public string Key { get; set; } = string.Empty;

    [ToolPin(Id = "DefaultValue", Label = "Default Value", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Single, IsRequired = false)]
    public object? DefaultValue { get; set; }
}

public class GetMapItemOutputs
{
    [ToolPin(Id = "Value", Label = "Value", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Single)]
    public object? Value { get; set; }

    [ToolPin(Id = "Found", Label = "Found", PrimitiveType = PinPrimitiveType.Boolean, Cardinality = PinCardinality.Single)]
    public bool Found { get; set; }
}

public class GetMapItemTool : BaseResolverTool<GetMapItemInputs, GetMapItemOutputs>
{
    public override string Key => "GetMapItem";
    public override string Label => "Get Map Item";
    public override IReadOnlyList<string> Aliases => ["GetMapValue"];
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<GetMapItemOutputs> ExecuteCoreAsync(GetMapItemInputs input, ToolExecutionContext context)
    {
        var targetKey = input.Key?.Trim() ?? string.Empty;
        object? foundVal = null;
        var found = false;

        if (input.Map.Count > 0)
        {
            // 1. Exact match first
            foreach (var (k, v) in input.Map)
            {
                if (string.Equals(k, targetKey, StringComparison.OrdinalIgnoreCase))
                {
                    foundVal = v;
                    found = true;
                    break;
                }
            }

            // 2. Fuzzy / Path-aware match fallback
            if (!found)
            {
                foreach (var (k, v) in input.Map)
                {
                    if (IsKeyMatch(k, targetKey))
                    {
                        foundVal = v;
                        found = true;
                        break;
                    }
                }
            }
        }

        var resultValue = found ? foundVal : input.DefaultValue;

        return Task.FromResult(new GetMapItemOutputs
        {
            Found = found,
            Value = resultValue
        });
    }

    private static bool IsKeyMatch(string? entryKey, string targetKey)
    {
        if (string.IsNullOrEmpty(entryKey) || string.IsNullOrEmpty(targetKey))
            return false;

        // 1. Direct match
        if (string.Equals(entryKey, targetKey, StringComparison.OrdinalIgnoreCase))
            return true;

        // 2. Slash normalization (path/to/file vs path\to\file)
        var normEntry = entryKey.Replace('\\', '/').Trim('/');
        var normTarget = targetKey.Replace('\\', '/').Trim('/');
        if (string.Equals(normEntry, normTarget, StringComparison.OrdinalIgnoreCase))
            return true;

        // 3. Path suffix match (e.g. entry is "Export/a.fbx" and target is "C:/ws/Export/a.fbx" or vice versa)
        if (normTarget.EndsWith("/" + normEntry, StringComparison.OrdinalIgnoreCase) ||
            normEntry.EndsWith("/" + normTarget, StringComparison.OrdinalIgnoreCase))
            return true;

        // 4. Filename match fallback if both look like file paths with extensions
        var fileEntry = Path.GetFileName(normEntry);
        var fileTarget = Path.GetFileName(normTarget);
        if (!string.IsNullOrEmpty(fileEntry) && !string.IsNullOrEmpty(fileTarget) &&
            fileEntry.Contains('.') && fileTarget.Contains('.') &&
            string.Equals(fileEntry, fileTarget, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }
}
