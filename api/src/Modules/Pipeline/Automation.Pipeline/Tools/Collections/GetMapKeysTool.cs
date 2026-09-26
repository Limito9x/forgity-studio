using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class GetMapKeysInputs
{
    [ToolPin(Id = "Map", Label = "Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = true)]
    public Dictionary<string, object?> Map { get; set; } = [];
}

public class GetMapKeysOutputs
{
    [ToolPin(Id = "Keys", Label = "Keys", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Array)]
    public List<string> Keys { get; set; } = [];
}

public class GetMapKeysTool : BaseResolverTool<GetMapKeysInputs, GetMapKeysOutputs>
{
    public override string Key => "GetMapKeys";
    public override string Label => "Get Map Keys";
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<GetMapKeysOutputs> ExecuteCoreAsync(GetMapKeysInputs input, ToolExecutionContext context)
    {
        return Task.FromResult(new GetMapKeysOutputs
        {
            Keys = input.Map.Keys.ToList()
        });
    }
}
