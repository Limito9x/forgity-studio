using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Utility;

/// <summary>
/// Tool điều khiển vòng lặp ForEach qua Array (For Each Loop) chuẩn hóa theo Unreal Engine Blueprint.
/// Với mỗi phần tử trong mảng Array, kích hoạt luồng [Loop Body] cùng [Item], [Index].
/// Khi duyệt xong toàn bộ, kích hoạt luồng [Completed] và trả về [ResultArray], [Count].
/// </summary>
public class ForEachLoopTool : IResolverTool
{
    public string Key => "ForEach";
    public string Label => "For Each";
    public string? Category => "Flow Control";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Array",
            Label = "Array",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array,
            IsRequired = true
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "loop_body",
            Label = "Loop Body",
            Kind = PinKind.Exec,
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        },
        new()
        {
            Id = "completed",
            Label = "Completed",
            Kind = PinKind.Exec,
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        },
        new()
        {
            Id = "Item",
            Label = "Item",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        },
        new()
        {
            Id = "Index",
            Label = "Array Index",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        },
        new()
        {
            Id = "Count",
            Label = "Count",
            PrimitiveType = PinPrimitiveType.Number,
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
            ["loop_body"] = true,
            ["completed"] = true,
            ["Item"] = string.Empty,
            ["Index"] = 0,
            ["Count"] = 0
        });
    }
}
