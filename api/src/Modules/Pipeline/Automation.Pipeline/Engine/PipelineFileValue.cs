using Automation.Files.Contracts;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Engine;

public record PipelineUnboundFileInfo(
    string? OriginalFileName,
    string? HashSha256,
    long? SizeBytes,
    string? ContentType
);

public static class PipelineFileValue
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static bool IsFilePin(PinDefinition? pin) => pin != null && pin.Kind == PinKind.Data &&
        (pin.PrimitiveType == PinPrimitiveType.Asset || pin.Id.Contains("preset", StringComparison.OrdinalIgnoreCase));

    public static JsonElement AsJson(object? value) => JsonSerializer.SerializeToElement(value, JsonOptions);

    public static bool TryGetLinkId(object? value, out Guid id)
    {
        var json = AsJson(value);
        id = Guid.Empty;
        return json.ValueKind == JsonValueKind.Object && json.TryGetProperty("assetLinkId", out var property) &&
            property.ValueKind == JsonValueKind.String && Guid.TryParse(property.GetString(), out id) && id != Guid.Empty;
    }

    public static bool TryGetDraft(object? value, out Guid assetId, out string? originalName)
    {
        assetId = Guid.Empty;
        originalName = null;
        var json = AsJson(value);
        if (json.ValueKind == JsonValueKind.Object &&
            !json.TryGetProperty("assetLinkId", out _) &&
            json.TryGetProperty("assetId", out var assetProp) &&
            assetProp.ValueKind == JsonValueKind.String &&
            Guid.TryParse(assetProp.GetString(), out assetId) &&
            assetId != Guid.Empty &&
            json.TryGetProperty("originalName", out var nameProp) &&
            nameProp.ValueKind == JsonValueKind.String)
        {
            originalName = nameProp.GetString();
            return true;
        }
        return false;
    }

    public static bool TryGetUnbound(object? value, out PipelineUnboundFileInfo? info)
    {
        info = null;
        var json = AsJson(value);
        if (json.ValueKind == JsonValueKind.Object &&
            json.TryGetProperty("status", out var statusProp) &&
            statusProp.ValueKind == JsonValueKind.String &&
            string.Equals(statusProp.GetString(), "unbound", StringComparison.OrdinalIgnoreCase))
        {
            string? name = json.TryGetProperty("originalFileName", out var np) && np.ValueKind == JsonValueKind.String ? np.GetString() : null;
            string? hash = json.TryGetProperty("hashSha256", out var hp) && hp.ValueKind == JsonValueKind.String ? hp.GetString() : null;
            string? ctype = json.TryGetProperty("contentType", out var cp) && cp.ValueKind == JsonValueKind.String ? cp.GetString() : null;
            long? size = json.TryGetProperty("sizeBytes", out var sp) && sp.ValueKind == JsonValueKind.Number && sp.TryGetInt64(out var s) ? s : null;
            info = new PipelineUnboundFileInfo(name, hash, size, ctype);
            return true;
        }
        return false;
    }

    public static AssetLinkOwner Owner(Guid nodeId, string pinId) =>
        new("PipelineNode", nodeId.ToString(), Constants.PipelineAssetSlots.NodeConfigPin(pinId));

    public static IReadOnlyList<AssetLinkReference> References(Guid nodeId, JsonDocument? config)
    {
        if (config?.RootElement.ValueKind != JsonValueKind.Object) return [];
        return config.RootElement.EnumerateObject()
            .Where(x => TryGetLinkId(x.Value, out _) && !string.IsNullOrWhiteSpace(x.Name) &&
                !x.Name.Contains('/') && $"{Constants.PipelineAssetSlots.NodeConfig}/{x.Name}".Length <= 100)
            .Select(x => new AssetLinkReference(AsJson(x.Value).GetProperty("assetLinkId").GetGuid(), Owner(nodeId, x.Name)))
            .ToList();
    }
}
