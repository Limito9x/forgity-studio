namespace Automation.Pipeline.Engine.Models;

/// <summary>
/// Value Object đại diện cho khóa chân Pin đã được chuẩn hóa.
/// Triệt tiêu việc lặp đi lặp lại code Replace(" ", "").Replace("_", "").ToLowerInvariant().
/// </summary>
public readonly record struct CanonicalPinKey : IEquatable<CanonicalPinKey>, IEquatable<string>
{
    public string Raw { get; }
    public string Canonical { get; }

    public CanonicalPinKey(string? raw)
    {
        Raw = raw ?? string.Empty;
        Canonical = Normalize(Raw);
    }

    public static string Normalize(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return string.Empty;
        return key.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
    }

    public static bool IsMatching(string? a, string? b)
    {
        if (string.IsNullOrWhiteSpace(a) && string.IsNullOrWhiteSpace(b)) return true;
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b)) return false;
        return Normalize(a) == Normalize(b);
    }

    public bool Equals(CanonicalPinKey other) => Canonical == other.Canonical;
    public bool Equals(string? other) => Canonical == Normalize(other);

    public override int GetHashCode() => Canonical.GetHashCode();
    public override string ToString() => Raw;

    public static implicit operator CanonicalPinKey(string? raw) => new(raw);
    public static implicit operator string(CanonicalPinKey key) => key.Raw;
}
