using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class MergeMapsInputs
{
    [ToolPin(Id = "TargetMap", Label = "Target Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = false)]
    public Dictionary<string, object?> TargetMap { get; set; } = [];

    [ToolPin(Id = "SourceMap", Label = "Source Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = false)]
    public Dictionary<string, object?> SourceMap { get; set; } = [];

    [ToolPin(Id = "MapA", Label = "Map A", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = false)]
    public Dictionary<string, object?> MapA { get; set; } = [];

    [ToolPin(Id = "MapB", Label = "Map B", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = false)]
    public Dictionary<string, object?> MapB { get; set; } = [];
}

public class MergeMapsOutputs
{
    [ToolPin(Id = "Result", Label = "Result Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map)]
    public Dictionary<string, object?> Result { get; set; } = [];

    [ToolPin(Id = "Map", Label = "Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map)]
    public Dictionary<string, object?> Map => Result;
}

/// <summary>
/// Tool gộp 2 Map (Merge/Append Maps) tương tự Unreal Engine.
/// Toàn bộ các cặp Key-Value từ SourceMap (hoặc MapB) sẽ được gộp vào TargetMap (hoặc MapA), ghi đè nếu trùng Key.
/// </summary>
public class MergeMapsTool : BaseResolverTool<MergeMapsInputs, MergeMapsOutputs>
{
    public override string Key => "MergeMaps";
    public override string Label => "Merge Maps";
    public override IReadOnlyList<string> Aliases => ["AppendMap"];
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<MergeMapsOutputs> ExecuteCoreAsync(MergeMapsInputs input, ToolExecutionContext context)
    {
        var baseMap = input.TargetMap.Count > 0 ? input.TargetMap : input.MapA;
        var overlayMap = input.SourceMap.Count > 0 ? input.SourceMap : input.MapB;

        var merged = new Dictionary<string, object?>(baseMap, StringComparer.OrdinalIgnoreCase);
        foreach (var (k, v) in overlayMap)
        {
            merged[k] = v;
        }

        return Task.FromResult(new MergeMapsOutputs
        {
            Result = merged
        });
    }
}
