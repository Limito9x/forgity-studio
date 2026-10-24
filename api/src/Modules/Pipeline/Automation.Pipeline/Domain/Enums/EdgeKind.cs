using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum EdgeKind
{
    Exec = 1,
    Data = 2
}
