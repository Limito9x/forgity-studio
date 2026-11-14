using System.Text.Json.Serialization;
namespace Automation.Pipeline.Contracts.Validation;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PipelineDiagnosticSeverity
{
    Error,
    Warning
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PipelineDiagnosticCode
{
    DagCycleDetected,
    MissingNodeDefinition,
    UnselectedStructSchema,
    UnresolvedRequiredPin,
    DanglingEdgePin,
    IncompatiblePinType,
    OrphanNode,
    UnconnectedReturnOutput,
    InvalidStagePlacement
}

public sealed record PipelineDiagnostic(
    PipelineDiagnosticCode Code,
    PipelineDiagnosticSeverity Severity,
    string Message,
    Guid? NodeId = null,
    string? NodeLabel = null,
    string? PinId = null,
    Guid? EdgeId = null);

public sealed record PipelineContractValidationResult(
    bool IsValid,
    IReadOnlyList<PipelineDiagnostic> Diagnostics,
    IReadOnlyList<string> CycleNodeIds,
    IReadOnlyList<UnresolvedPinError> UnresolvedPins);

public sealed record UnresolvedPinError(
    string NodeId,
    string NodeLabel,
    string PinName,
    string PrimitiveType);
