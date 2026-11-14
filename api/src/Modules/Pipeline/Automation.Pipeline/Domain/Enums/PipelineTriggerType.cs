using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PipelineTriggerType
{
    Manual = 0,
    OnResourceCreated = 1,
    OnResourceVersionUpdated = 2
}
