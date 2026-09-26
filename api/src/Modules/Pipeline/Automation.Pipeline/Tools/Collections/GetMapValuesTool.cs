using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class GetMapValuesInputs
{
    [ToolPin(Id = "Map", Label = "Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = true)]
    public Dictionary<string, object?> Map { get; set; } = [];
}

public class GetMapValuesOutputs
{
    [ToolPin(Id = "Values", Label = "Values", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Array)]
    public List<object?> Values { get; set; } = [];
}

public class GetMapValuesTool : BaseResolverTool<GetMapValuesInputs, GetMapValuesOutputs>
{
    public override string Key => "GetMapValues";
    public override string Label => "Get Map Values";
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<GetMapValuesOutputs> ExecuteCoreAsync(GetMapValuesInputs input, ToolExecutionContext context)
    {
        return Task.FromResult(new GetMapValuesOutputs
        {
            Values = input.Map.Values.ToList()
        });
    }
}
