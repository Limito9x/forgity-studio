using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class GetArrayItemInputs
{
    [ToolPin(Id = "Array", Label = "Array", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Array, IsRequired = true)]
    public List<object?> Array { get; set; } = [];

    [ToolPin(Id = "Index", Label = "Index", PrimitiveType = PinPrimitiveType.Number, Cardinality = PinCardinality.Single, IsRequired = true)]
    public int Index { get; set; }

    [ToolPin(Id = "DefaultValue", Label = "Default Value", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Single, IsRequired = false)]
    public object? DefaultValue { get; set; }
}

public class GetArrayItemOutputs
{
    [ToolPin(Id = "Item", Label = "Item", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Single)]
    public object? Item { get; set; }

    [ToolPin(Id = "Found", Label = "Found", PrimitiveType = PinPrimitiveType.Boolean, Cardinality = PinCardinality.Single)]
    public bool Found { get; set; }
}

public class GetArrayItemTool : BaseResolverTool<GetArrayItemInputs, GetArrayItemOutputs>
{
    public override string Key => "GetArrayItem";
    public override string Label => "Get Array Item";
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<GetArrayItemOutputs> ExecuteCoreAsync(GetArrayItemInputs input, ToolExecutionContext context)
    {
        var targetIndex = input.Index;
        var list = input.Array;

        // Support negative index like -1 for last element
        if (targetIndex < 0 && list.Count > 0)
        {
            targetIndex = list.Count + targetIndex;
        }

        var found = targetIndex >= 0 && targetIndex < list.Count;
        var item = found ? list[targetIndex] : input.DefaultValue;

        return Task.FromResult(new GetArrayItemOutputs
        {
            Found = found,
            Item = item
        });
    }
}
