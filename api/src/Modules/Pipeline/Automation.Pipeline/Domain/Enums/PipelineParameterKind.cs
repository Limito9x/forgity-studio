using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PipelineParameterKind
{
    Input = 1,
    Output = 2,
    Variable = 3,
    Context = 4
}

