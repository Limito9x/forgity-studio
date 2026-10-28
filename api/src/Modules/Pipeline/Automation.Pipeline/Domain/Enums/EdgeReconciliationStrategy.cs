using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum EdgeReconciliationStrategy
{
    KeepCompatiblePins = 0,
    UnpinAll = 1
}
