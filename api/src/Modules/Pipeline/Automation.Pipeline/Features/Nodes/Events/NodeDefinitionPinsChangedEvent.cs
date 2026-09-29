using Automation.Pipeline.Domain.Enums;

namespace Automation.Pipeline.Features.Nodes.Events;

public record NodeDefinitionPinsChangedEvent(
    Guid NodeDefinitionId,
    string NodeKey,
    Guid ProjectId,
    List<string> OldInputPinIds,
    List<string> OldOutputPinIds,
    List<string> NewInputPinIds,
    List<string> NewOutputPinIds,
    EdgeReconciliationStrategy Strategy
);