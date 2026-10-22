using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PinPrimitiveType
{
    String,
    Number,
    Boolean,
    Path,
    EntityRef,
    Asset,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PinCardinality
{
    Single,
    Array,
    Map,
}

