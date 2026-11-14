using Automation.Pipeline.Domain.Enums;

namespace Automation.Pipeline.Contracts.Validation;

public record UnresolvedPin(
    Guid NodeId,
    string NodeLabel,
    string PinKey,
    string PinLabel,
    PinPrimitiveType PrimitiveType,
    string Reason
);

public class UnresolvedPinsError : Error
{
    public IReadOnlyList<UnresolvedPin> UnresolvedPins { get; }
    public IReadOnlyList<PipelineDiagnostic>? Diagnostics { get; }

    public UnresolvedPinsError(IReadOnlyList<UnresolvedPin> unresolvedPins)
        : base($"Pipeline has {unresolvedPins.Count} unresolved required pin(s).")
    {
        UnresolvedPins = unresolvedPins;
        Metadata.Add("UnresolvedPins", unresolvedPins);
    }

    public UnresolvedPinsError(
        string message,
        IReadOnlyList<UnresolvedPin> unresolvedPins,
        IReadOnlyList<PipelineDiagnostic>? diagnostics = null
    ) : base(message)
    {
        UnresolvedPins = unresolvedPins;
        Diagnostics = diagnostics;
        Metadata.Add("UnresolvedPins", unresolvedPins);
        if (diagnostics != null)
        {
            Metadata.Add("Diagnostics", diagnostics);
        }
    }
}
