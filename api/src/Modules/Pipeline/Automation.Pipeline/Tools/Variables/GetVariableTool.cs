using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.DataResolver;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Variables;

public class GetVariableTool(
    IExecutionMemoryStore? memoryStore = null,
    ILogger<GetVariableTool>? logger = null
) : IResolverTool
{
    public string Key => "GetVariable";
    public string Label => "Get Variable";
    public string? Category => "Variables";
    public bool IsPure => true;
    public bool IsDynamic => true;

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

                return (Inputs, dynamicOutputs);
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

        object? val = null;
        if (context.PipelineExecutionId != Guid.Empty && !string.IsNullOrWhiteSpace(varName) && memoryStore != null)
        {
            val = await memoryStore.GetVariableAsync(context.PipelineExecutionId, varName, context.CancellationToken);
        }

        val ??= inputs.GetValueOrDefault("Value") ?? inputs.GetValueOrDefault("value") ?? string.Empty;

        logger?.LogInformation("GetVariableTool: Read variable '{VarName}' for execution {ExecutionId} -> {Value}",
            varName, context.PipelineExecutionId, val != null ? System.Text.Json.JsonSerializer.Serialize(val) : "null");

        return new Dictionary<string, object>
        {
            ["Value"] = val!
        };
    }
}
