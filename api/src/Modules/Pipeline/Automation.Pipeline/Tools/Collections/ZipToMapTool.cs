using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class ZipToMapInputs
{
    [ToolPin(Id = "Keys", Label = "Keys", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Array, IsRequired = true)]
    public List<string> Keys { get; set; } = [];

    [ToolPin(Id = "Values", Label = "Values", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Array, IsRequired = true)]
    public List<object?> Values { get; set; } = [];
}

public class ZipToMapOutputs
{
    [ToolPin(Id = "Map", Label = "Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map)]
    public Dictionary<string, object?> Map { get; set; } = [];
}

public class ZipToMapTool : BaseResolverTool<ZipToMapInputs, ZipToMapOutputs>
{
    public override string Key => "ZipToMap";
    public override string Label => "Zip To Map";
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<ZipToMapOutputs> ExecuteCoreAsync(ZipToMapInputs input, ToolExecutionContext context)
    {
        var map = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        var limit = Math.Min(input.Keys.Count, input.Values.Count);
        for (var i = 0; i < limit; i++)
        {
            map[input.Keys[i]] = input.Values[i];
        }

        return Task.FromResult(new ZipToMapOutputs
        {
            Map = map
        });
    }
}
