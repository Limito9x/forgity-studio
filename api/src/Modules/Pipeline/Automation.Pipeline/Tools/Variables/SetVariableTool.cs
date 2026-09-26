using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.DataResolver;

namespace Automation.Pipeline.Tools.Variables;

public class SetVariableTool(IExecutionMemoryStore? memoryStore = null) : IResolverTool
{
    public string Key => "SetVariable";
    public string Label => "Set Variable";
    public string? Category => "Variables";
    public bool IsPure => false;

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var varName = configValues?.GetValueOrDefault("VariableName")?.ToString()?.Trim();
        if (string.IsNullOrWhiteSpace(varName) && configValues?.TryGetValue("variablename", out var vn) == true)
        {
            varName = vn?.ToString()?.Trim();
        }

        if (!string.IsNullOrWhiteSpace(varName) && context?.Variables is { } vars)
        {
            var matchedVar = vars.FirstOrDefault(v => string.Equals(v.Name, varName, StringComparison.OrdinalIgnoreCase));
            if (matchedVar != null)
            {
                var dynamicInputs = new List<PinDefinition>
                {
                    new()
                    {
                        Id = "VariableName",
                        Label = "Variable Name",
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        EntityTarget = "variable",
                        Cardinality = PinCardinality.Single,
                        IsRequired = true,
                        DefaultValue = varName
                    },
                    new()
                    {
                        Id = "Value",
                        Label = "Value",
                        Kind = PinKind.Data,
                        PrimitiveType = matchedVar.Type,
                        Cardinality = matchedVar.Cardinality,
                        Metadata = matchedVar.StructType,
                        IsRequired = true
                    }
                };

                var dynamicOutputs = new List<PinDefinition>
                {
                    new()
                    {
                        Id = "Value",
                        Label = "Value",
                        Kind = PinKind.Data,
                        PrimitiveType = matchedVar.Type,
                        Cardinality = matchedVar.Cardinality,
                        Metadata = matchedVar.StructType,
                        IsRequired = true
                    }
                };

                return (dynamicInputs, dynamicOutputs);
            }
        }

        return (Inputs, Outputs);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "VariableName",
            Label = "Variable Name",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "variable",
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            DefaultValue = ""
        },
        new()
        {
            Id = "Value",
            Label = "Value",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Value",
            Label = "Value",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var varName = inputs.GetValueOrDefault("VariableName")?.ToString()
                      ?? inputs.GetValueOrDefault("variablename")?.ToString()
                      ?? "MyVar";
        var val = inputs.GetValueOrDefault("Value") ?? inputs.GetValueOrDefault("value") ?? string.Empty;

        if (context.PipelineExecutionId != Guid.Empty && !string.IsNullOrWhiteSpace(varName) && memoryStore != null)
        {
            await memoryStore.SetVariableAsync(context.PipelineExecutionId, varName, val, context.CancellationToken);
        }

        return new Dictionary<string, object>
        {
            ["Value"] = val
        };
    }
}
