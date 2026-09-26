using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class GetCollectionCountInputs
{
    [ToolPin(Id = "Collection", Label = "Collection", PrimitiveType = PinPrimitiveType.String, IsRequired = true)]
    public object? Collection { get; set; }
}

public class GetCollectionCountOutputs
{
    [ToolPin(Id = "Count", Label = "Count", PrimitiveType = PinPrimitiveType.Number, Cardinality = PinCardinality.Single)]
    public int Count { get; set; }
}

public class GetCollectionCountTool : BaseResolverTool<GetCollectionCountInputs, GetCollectionCountOutputs>
{
    public override string Key => "GetCollectionCount";
    public override string Label => "Get Collection Count";
    public override string? Category => "Collections";
    public override bool IsPure => true;

    protected override Task<GetCollectionCountOutputs> ExecuteCoreAsync(GetCollectionCountInputs input, ToolExecutionContext context)
    {
        var count = 0;
        var raw = input.Collection;

        if (raw != null)
        {
            if (raw is ICollection col)
            {
                count = col.Count;
            }
            else if (raw is JsonElement jsonElem)
            {
                if (jsonElem.ValueKind == JsonValueKind.Array) count = jsonElem.GetArrayLength();
                else if (jsonElem.ValueKind == JsonValueKind.Object) count = jsonElem.EnumerateObject().Count();
            }
            else if (raw is string str && (str.StartsWith('[') || str.StartsWith('{')))
            {
                try
                {
                    using var doc = JsonDocument.Parse(str);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array) count = doc.RootElement.GetArrayLength();
                    else if (doc.RootElement.ValueKind == JsonValueKind.Object) count = doc.RootElement.EnumerateObject().Count();
                }
                catch { }
            }
            else if (raw is IEnumerable enumerable && raw is not string)
            {
                foreach (var _ in enumerable) count++;
            }
        }

        return Task.FromResult(new GetCollectionCountOutputs
        {
            Count = count
        });
    }
}
