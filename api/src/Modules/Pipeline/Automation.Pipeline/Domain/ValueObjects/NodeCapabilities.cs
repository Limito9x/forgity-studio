namespace Automation.Pipeline.Domain.ValueObjects;

/// <summary>
/// Khai báo năng lực hành vi và biến thể giao diện của Node trên Canvas (Single Source of Truth từ C#).
/// </summary>
public record NodeCapabilities(
    bool CanAddPin = false,
    bool CanRemovePin = false,
    string? PinAddMode = null,
    string? InspectorMode = null,
    string? RuleNotes = null,
    string ViewVariant = "Standard",
    IReadOnlyList<string>? ProtectedPinIds = null
);
