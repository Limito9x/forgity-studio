namespace Automation.Content.Contracts;

public record AnchorParseResult(
    string ContentName,
    string AnchorPath,
    string RawFileName
);

public static class AnchorConventionParser
{
    /// <summary>
    /// Parses a file name or relative path according to the '_' token delimiter convention.
    /// Format: {ContentName}_{AnchorParts...}_{LeafName}.ext
    /// </summary>
    public static AnchorParseResult Parse(string fileNameOrPath)
    {
        if (string.IsNullOrWhiteSpace(fileNameOrPath))
        {
            return new AnchorParseResult(string.Empty, "root", string.Empty);
        }

        var fileName = Path.GetFileName(fileNameOrPath);
        var stem = Path.GetFileNameWithoutExtension(fileName);
        var tokens = stem.Split('_', StringSplitOptions.RemoveEmptyEntries);

        if (tokens.Length == 0)
        {
            return new AnchorParseResult(string.Empty, $"root/{fileName}", fileName);
        }

        var contentName = tokens[0];

        if (tokens.Length == 1)
        {
            // Single token: e.g. "Eva.duf" -> Content: "Eva", AnchorPath: "root/Eva.duf"
            return new AnchorParseResult(contentName, $"root/{fileName}", fileName);
        }

        if (tokens.Length == 2)
        {
            // Two tokens: e.g. "Eva_Outfit1.blend" -> Content: "Eva", AnchorPath: "Outfit1/Eva_Outfit1.blend"
            return new AnchorParseResult(contentName, $"{tokens[1]}/{fileName}", fileName);
        }

        // 3 or more tokens: e.g. "Eva_Outfit1_BrzUsBra.fbx" -> Content: "Eva", AnchorPath: "Outfit1/BrzUsBra"
        // e.g. "Eva_Outfits_Summer_SilkDress.fbx" -> Content: "Eva", AnchorPath: "Outfits/Summer/SilkDress"
        var anchorParts = string.Join("/", tokens.Skip(1));
        return new AnchorParseResult(contentName, anchorParts, fileName);
    }
}

