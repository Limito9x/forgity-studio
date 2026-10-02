using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Engine.Models;

public class ExecStep
{
    public Guid NodeId { get; init; }
    public Guid? StageId { get; init; }
    public string RefId { get; init; } = string.Empty;
    public PipelineNodeKind Kind { get; init; } = PipelineNodeKind.Custom;
    public string Label { get; init; } = string.Empty;
    public string Executor { get; init; } = "dotNet";
    public IReadOnlyList<PinDefinition> InputPins { get; init; } = [];
    public IReadOnlyList<PinDefinition> OutputPins { get; init; } = [];
    public List<IncomingPinConnection> IncomingConnections { get; init; } = [];
    public JsonDocument? Config { get; init; }
}
