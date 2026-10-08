using Automation.Files.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.DataResolver.Resolvers;

public class AssetResolver(IAssetApi assetApi, ILogger<AssetResolver> logger)
{
    // Compatibility for existing runtime input uploads. Inspector config uses link PKs instead.
    public async Task<object?> ResolveRuntimeAssetAsync(Guid assetId, CancellationToken ct = default)
    {
        var result = await assetApi.GetAssetByIdAsync(assetId, ct);
        if (result.IsFailed) throw new InvalidOperationException(result.Errors.First().Message);
        var file = result.Value;
        return new Dictionary<string, object?>
        {
            ["$file"] = new Dictionary<string, object?>
            {
                ["url"] = file.PublicUrl, ["filename"] = file.Name,
                ["hash"] = assetId.ToString("N"), ["size"] = file.Size
            }
        };
    }

    public async Task<object?> ResolveFileAsync(object? value, AssetLinkOwner owner, CancellationToken ct = default)
    {
        if (value == null || value is string text && string.IsNullOrWhiteSpace(text)) return value;
        var json = PipelineFileValue.AsJson(value);
        if (json.ValueKind == System.Text.Json.JsonValueKind.Object && json.TryGetProperty("$file", out _)) return value;
        if (!PipelineFileValue.TryGetLinkId(value, out var linkId))
            throw new InvalidOperationException($"File pin '{owner.SlotKey}' requires a saved asset link. Upload or relink the file before running.");
        var result = await assetApi.GetLinksByIdsAsync([new(linkId, owner)], ct);
        if (result.IsFailed) throw new InvalidOperationException(result.Errors.First().Message);
        var file = result.Value.Single();
        if (string.IsNullOrWhiteSpace(file.HashSha256))
            throw new InvalidOperationException($"File link '{linkId}' has no content hash.");
        logger.LogDebug("Resolved file link {LinkId} ({FileName})", linkId, file.OriginalName);
        return new Dictionary<string, object?>
        {
            ["$file"] = new Dictionary<string, object?>
            {
                ["url"] = file.PublicUrl,
                ["filename"] = file.OriginalName,
                ["hash"] = file.HashSha256,
                ["size"] = file.SizeBytes
            }
        };
    }
}
