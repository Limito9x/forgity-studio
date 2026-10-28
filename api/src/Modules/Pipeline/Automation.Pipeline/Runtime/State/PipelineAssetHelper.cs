using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Microsoft.Extensions.Logging;
namespace Automation.Pipeline.Runtime.State;

public static class PipelineAssetHelper
{
    public static HashSet<Guid> ExtractAssetIds(JsonDocument? doc)
    {
        var result = new HashSet<Guid>();
        if (doc == null) return result;

        ExtractAssetIdsFromElement(doc.RootElement, result);
        return result;
    }

    public static HashSet<Guid> ExtractAssetIdsFromDictionary(IDictionary<string, object?>? dict)
    {
        var result = new HashSet<Guid>();
        if (dict == null) return result;

        foreach (var (_, val) in dict)
        {
            if (val is null) continue;
            if (val is Guid g && g != Guid.Empty)
            {
                result.Add(g);
            }
            else if (val is string str && Guid.TryParse(str, out var parsedGuid) && parsedGuid != Guid.Empty)
            {
                result.Add(parsedGuid);
            }
            else if (val is JsonElement elem)
            {
                ExtractAssetIdsFromElement(elem, result);
            }
            else if (val is JsonDocument jDoc)
            {
                ExtractAssetIdsFromElement(jDoc.RootElement, result);
            }
        }

        return result;
    }

    private static void ExtractAssetIdsFromElement(JsonElement element, HashSet<Guid> result)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                var str = element.GetString();
                if (!string.IsNullOrEmpty(str) && Guid.TryParse(str, out var g) && g != Guid.Empty)
                {
                    result.Add(g);
                }
                break;

            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    ExtractAssetIdsFromElement(item, result);
                }
                break;

            case JsonValueKind.Object:
                foreach (var prop in element.EnumerateObject())
                {
                    ExtractAssetIdsFromElement(prop.Value, result);
                }
                break;
        }
    }

    public static async Task SyncNodeAssetsAsync(
        IAssetApi assetApi,
        Guid nodeId,
        JsonDocument? oldConfig,
        JsonDocument? newConfig,
        ILogger? logger = null,
        CancellationToken ct = default
    )
    {
        var oldAssets = ExtractAssetIds(oldConfig);
        var newAssets = ExtractAssetIds(newConfig);

        var added = newAssets.Except(oldAssets).ToList();
        var removed = oldAssets.Except(newAssets).ToList();

        foreach (var assetId in added)
        {
            try
            {
                var linkRes = await assetApi.VerifyAndLinkAsync(
                    assetId: assetId,
                    ownerEntityType: "PipelineNode",
                    slotKey: PipelineAssetSlots.NodeConfig,
                    ownerEntityId: nodeId.ToString(),
                    originalName: "node_config_asset",
                    ct: ct
                );

                if (linkRes.IsFailed)
                {
                    logger?.LogWarning("Failed to link asset {AssetId} to PipelineNode {NodeId}: {Error}",
                        assetId, nodeId, linkRes.Errors.FirstOrDefault()?.Message);
                }
                else
                {
                    logger?.LogInformation("Successfully linked asset {AssetId} to PipelineNode {NodeId}", assetId, nodeId);
                }
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Exception while linking asset {AssetId} to PipelineNode {NodeId}", assetId, nodeId);
            }
        }

        foreach (var assetId in removed)
        {
            try
            {
                await assetApi.RemoveLinkAsync(assetId, nodeId.ToString(), ct);
                logger?.LogInformation("Removed asset link {AssetId} from PipelineNode {NodeId}", assetId, nodeId);
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Exception while removing asset link {AssetId} from PipelineNode {NodeId}", assetId, nodeId);
            }
        }
    }

    public static async Task RemoveNodeAssetsAsync(
        IAssetApi assetApi,
        Guid nodeId,
        JsonDocument? config,
        ILogger? logger = null,
        CancellationToken ct = default
    )
    {
        var assets = ExtractAssetIds(config);
        foreach (var assetId in assets)
        {
            try
            {
                await assetApi.RemoveLinkAsync(assetId, nodeId.ToString(), ct);
                logger?.LogInformation("Removed asset link {AssetId} on deletion of PipelineNode {NodeId}", assetId, nodeId);
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Exception while removing asset link {AssetId} for PipelineNode {NodeId}", assetId, nodeId);
            }
        }
    }

    public static async Task LinkRuntimeInputAssetsAsync(
        IAssetApi assetApi,
        Guid executionId,
        IDictionary<string, object?>? runtimeInputs,
        ILogger? logger = null,
        CancellationToken ct = default
    )
    {
        var assets = ExtractAssetIdsFromDictionary(runtimeInputs);
        foreach (var assetId in assets)
        {
            try
            {
                var linkRes = await assetApi.VerifyAndLinkAsync(
                    assetId: assetId,
                    ownerEntityType: "PipelineExecution",
                    slotKey: PipelineAssetSlots.RuntimeInput,
                    ownerEntityId: executionId.ToString(),
                    originalName: "runtime_input_asset",
                    ct: ct
                );

                if (linkRes.IsFailed)
                {
                    logger?.LogWarning("Failed to link runtime asset {AssetId} to PipelineExecution {ExecutionId}: {Error}",
                        assetId, executionId, linkRes.Errors.FirstOrDefault()?.Message);
                }
                else
                {
                    logger?.LogInformation("Successfully linked runtime asset {AssetId} to PipelineExecution {ExecutionId}",
                        assetId, executionId);
                }
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Exception while linking runtime asset {AssetId} to PipelineExecution {ExecutionId}",
                    assetId, executionId);
            }
        }
    }
}
