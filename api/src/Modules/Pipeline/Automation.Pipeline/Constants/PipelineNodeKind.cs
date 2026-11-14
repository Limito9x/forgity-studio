using System.Text.Json.Serialization;

namespace Automation.Pipeline.Constants;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PipelineNodeKind
{
    Start = 1,
    Return = 2,
    Tool = 3,
    Custom = 4,
    FlowControl = 5,
    Variable = 6,
    SubPipeline = 7,
    Container = 8,
    Capsule = 9
}
