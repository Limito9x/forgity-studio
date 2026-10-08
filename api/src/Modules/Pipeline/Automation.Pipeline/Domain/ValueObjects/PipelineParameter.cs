using Automation.Pipeline.Domain.Enums;
using Automation.SharedKernel.Domain.Entities;

namespace Automation.Pipeline.Domain.ValueObjects;

public record PipelineParameter
{
    public Guid Id { get; init; } = IdGenerator.NewId();
    public string Key { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public PipelineParameterKind Kind { get; init; } = PipelineParameterKind.Variable;
    public PinPrimitiveType Type { get; init; } = PinPrimitiveType.String;
    public PinCardinality Cardinality { get; init; } = PinCardinality.Single;
    public string? StructType { get; init; }
    public bool IsRequired { get; init; } = false;
    public string? DefaultValue { get; init; }
    public string? Description { get; init; }
    public int Order { get; init; } = 0;
    public Dictionary<string, object?>? ContextData { get; init; }
}
