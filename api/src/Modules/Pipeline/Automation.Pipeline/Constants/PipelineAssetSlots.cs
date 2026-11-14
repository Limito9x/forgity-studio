namespace Automation.Pipeline.Constants;

public static class PipelineAssetSlots
{
    public const string CustomScript = "CustomScript";
    public const string NodeConfig = "NodeConfig";
    public const string RuntimeInput = "RuntimeInput";

    public static string NodeConfigPin(string pinId)
    {
        if (string.IsNullOrWhiteSpace(pinId) || pinId.Contains('/') ||
            $"{NodeConfig}/{pinId}".Length > 100)
        {
            throw new ArgumentException("Pin ID must be non-empty, contain no slash and fit in the slot key.", nameof(pinId));
        }

        return $"{NodeConfig}/{pinId}";
    }
}
