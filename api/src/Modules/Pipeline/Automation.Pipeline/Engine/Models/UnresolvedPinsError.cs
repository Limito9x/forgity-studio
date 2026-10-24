using Automation.Pipeline.Engine.Models;

namespace Automation.Pipeline.Engine.Models;

public class UnresolvedPinsError : Error
{
    public IReadOnlyList<UnresolvedPin> UnresolvedPins { get; }
    public IReadOnlyList<Contracts.Validation.PipelineDiagnostic>? Diagnostics { get; }

    public UnresolvedPinsError(IReadOnlyList<UnresolvedPin> unresolvedPins)
        : base($"Pipeline has {unresolvedPins.Count} unresolved required pin(s).")
    {
        UnresolvedPins = unresolvedPins;
        Metadata.Add("UnresolvedPins", unresolvedPins);
    }

    public UnresolvedPinsError(
        string message,
        IReadOnlyList<UnresolvedPin> unresolvedPins,
        IReadOnlyList<Contracts.Validation.PipelineDiagnostic>? diagnostics = null
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
