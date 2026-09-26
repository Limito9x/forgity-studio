using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class SetMapItemInputs
{
    [ToolPin(Id = "TargetMap", Label = "Target Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = false)]
    public Dictionary<string, object?> TargetMap { get; set; } = [];

    [ToolPin(Id = "Key", Label = "Key", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Single, IsRequired = true)]
    public string Key { get; set; } = string.Empty;

    [ToolPin(Id = "Value", Label = "Value", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Single, IsRequired = false, DefaultValue = "")]
    public object? Value { get; set; }
}

public class SetMapItemOutputs
{
    [ToolPin(Id = "Result", Label = "Result Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map)]
    public Dictionary<string, object?> Result { get; set; } = [];

    [ToolPin(Id = "Result Map", Label = "Result Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map)]
    public Dictionary<string, object?> ResultMap => Result;
}

/// <summary>
/// Pure Data Operator: Thêm hoặc cập nhật một cặp [Key, Value] vào Map và trả về Map mới.
/// </summary>
public class SetMapItemTool : BaseResolverTool<SetMapItemInputs, SetMapItemOutputs>
{
    public override string Key => "SetMapItem";
    public override string Label => "Set Map Item";
    public override IReadOnlyList<string> Aliases => ["SetMapKey", "AddMapItem", "SetMapValue"];
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<SetMapItemOutputs> ExecuteCoreAsync(SetMapItemInputs input, ToolExecutionContext context)
    {
        var map = new Dictionary<string, object?>(input.TargetMap, StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(input.Key))
        {
            map[input.Key] = input.Value ?? string.Empty;
        }

        return Task.FromResult(new SetMapItemOutputs
        {
            Result = map
        });
    }
}
