using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ExecutionStatus
{
    Pending = 1,
    Running = 2,
    WaitingForRunner = 3,
    Succeeded = 4,
    Failed = 5,
    Cancelled = 6
}
