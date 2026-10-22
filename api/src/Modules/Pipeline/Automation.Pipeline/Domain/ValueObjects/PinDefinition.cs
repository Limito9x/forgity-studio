using System.Text.Json.Serialization;
using Automation.Pipeline.Domain.Enums;

namespace Automation.Pipeline.Domain.ValueObjects;

public record PinDefinition
{
    public string Id { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public PinKind Kind { get; init; } = PinKind.Data;
    public PinPrimitiveType PrimitiveType { get; init; }
    public PinCardinality Cardinality { get; init; }
    public bool IsRequired { get; init; } = true;
    public object? DefaultValue { get; init; } = null;
    public string? Metadata { get; init; } = null;
    public string? StructType { get; set; } = null;
    public string? AllowedExtensions { get; init; } = null;

    [JsonIgnore]
    public string? EntityTarget
    {
        get => StructType;
        set => StructType = value;
    }
}

