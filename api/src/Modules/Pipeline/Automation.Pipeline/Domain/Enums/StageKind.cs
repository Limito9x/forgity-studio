using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum StageKind
{
    Worker = 1,
    Server = 2,
    Macro = 3
}
