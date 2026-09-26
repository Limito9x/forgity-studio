using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Utility;

public class BeginExecuteTool : IResolverTool
{
    public string Key => "BeginExecute";
    public string Label => "Begin Execute";
    public string? Category => "Utility";

    public IReadOnlyList<PinDefinition> Inputs => [];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new PinDefinition
        {
            Id = "exec_out",
            Label = "Exec",
            Kind = PinKind.Exec,
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        }
    ];

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        return Task.FromResult(new Dictionary<string, object>
        {
            ["exec_out"] = true
        });
    }
}
