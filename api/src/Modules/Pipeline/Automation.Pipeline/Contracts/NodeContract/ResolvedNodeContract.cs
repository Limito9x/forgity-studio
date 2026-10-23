using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Contracts.NodeContract;

public sealed record ResolvedNodeContract(
    Guid NodeId,
    string RefId,
    PipelineNodeKind Kind,
    string Label,
    string DefinitionLabel,
    string? Category,
    string Executor,
    bool IsPure,
    bool IsFlowControl,
    Guid? SubPipelineId,
    Guid? NodeDefinitionId,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    Dictionary<string, object?>? ConfigValues,
    Dictionary<string, object?>? Metadata,
    bool IsDefinitionMissing = false,
    string? MissingReason = null);
