using Automation.Pipeline.Domain.Enums;

namespace Automation.Pipeline.Tools.Attributes;

[AttributeUsage(AttributeTargets.Property)]
public class ToolPinAttribute : Attribute
{
    public string? Id { get; set; }
    public string? Label { get; set; }
    public PinKind Kind { get; set; } = PinKind.Data;

    private PinPrimitiveType _primitiveType = (PinPrimitiveType)(-1);
    public PinPrimitiveType PrimitiveType
    {
        get => _primitiveType;
        set => _primitiveType = value;
    }
    public bool HasPrimitiveType => (int)_primitiveType != -1;

    private PinCardinality _cardinality = (PinCardinality)(-1);
    public PinCardinality Cardinality
    {
        get => _cardinality;
        set => _cardinality = value;
    }
    public bool HasCardinality => (int)_cardinality != -1;

    public bool IsRequired { get; set; } = true;
    public object? DefaultValue { get; set; }
    public string? Metadata { get; set; }
    public string? EntityTarget { get; set; }
    public string? AllowedExtensions { get; set; }
}

[AttributeUsage(AttributeTargets.Property)]
public class ToolPinIgnoreAttribute : Attribute
{
}
