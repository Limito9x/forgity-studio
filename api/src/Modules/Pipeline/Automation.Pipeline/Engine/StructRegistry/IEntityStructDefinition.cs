using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Engine.StructRegistry;

public interface IEntityStructDefinition
{
    string StructType { get; }
    string Label { get; }
    IReadOnlyList<PinDefinition> OutputPins { get; }

    /// <summary>
    /// Mô phỏng mẫu dữ liệu JSON đại diện cho struct này (Sample Payload / Schema Preview).
    /// </summary>
    object? SampleJson { get; }

    Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    );
}

