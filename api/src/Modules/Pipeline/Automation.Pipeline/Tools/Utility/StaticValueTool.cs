using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Utility;

public class StaticValueTool : IResolverTool
{
    public string Key => "StaticValue";
    public string Label => "Static Value";
    public string? Category => "Utility";
    public bool IsPure => true;

    public IReadOnlyList<PinDefinition> Inputs =>
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "Value",
                Label = "Value",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = false,
            }
        };

    public IReadOnlyList<PinDefinition> Outputs =>
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "Value",
                Label = "Value",
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
        var val = inputs.TryGetValue("Value", out var rawVal) && rawVal != null
            ? rawVal.ToString() ?? string.Empty
            : string.Empty;

        var result = new Dictionary<string, object>
        {
            ["Value"] = val
        };

        return Task.FromResult(result);
    }
}
