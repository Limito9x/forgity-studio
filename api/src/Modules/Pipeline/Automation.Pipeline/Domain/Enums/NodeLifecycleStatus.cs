using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NodeLifecycleStatus
{
    Draft = 0,
    InReview = 1,
    Published = 2,
    Deprecated = 3
}
