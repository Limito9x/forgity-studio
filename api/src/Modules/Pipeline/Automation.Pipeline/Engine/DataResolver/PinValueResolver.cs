using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Tools;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.DataResolver;

public class PinValueResolver(
    IPipelineGraphProvider graphProvider,
    IExecutionMemoryStore memoryStore,
    IToolRegistry toolRegistry,
    PureNodeResolver pureNodeResolver,
    AssetResolver assetResolver,
    ILogger<PinValueResolver> logger
) : IPinValueResolver
{
    public async Task<object?> ResolvePinAsync(
        Guid executionId,
        Guid nodeId,
        string pinKey,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        // 1. Check Redis / Memory Cache (HIT -> return immediately)
        var cached = await memoryStore.GetNodePinValueAsync(executionId, nodeId, pinKey, scope, ct);
        if (cached != null)
        {
            return cached;
        }

        var pipeline = await graphProvider.GetPipelineByExecutionIdAsync(executionId, ct);
        if (pipeline == null)
        {
            logger.LogWarning("Pipeline not found for execution {ExecutionId}", executionId);
            return null;
        }

        var node = pipeline.Nodes.FirstOrDefault(n => n.Id == nodeId);
        if (node == null)
        {
            logger.LogWarning("Node {NodeId} not found in pipeline {PipelineId}", nodeId, pipeline.Id);
            return null;
        }

        object? resolvedValue = null;

        // 1. Check Upstream Connections -> Recursive Pull (Wires have highest priority)
        var normalizedTarget = NormalizePin(pinKey);
        var pinDef = FindPinDefinition(node, pinKey);
        var normalizedLabel = pinDef?.Label != null ? NormalizePin(pinDef.Label) : null;

        async Task<object?> ResolveConnectionAsync(PipelineEdge conn)
        {
            var srcNode = pipeline.Nodes.FirstOrDefault(n => n.Id == conn.SourcePipelineNodeId);
            if (srcNode == null) return null;

            var isPure = toolRegistry.Get(srcNode.RefId) is { IsPure: true };
            if (isPure)
            {
                return await pureNodeResolver.ResolvePureNodeOutputAsync(
                    executionId,
                    srcNode,
                    conn.SourcePin,
                    scope,
                    this,
                    ct
                );
            }

            var val = await memoryStore.GetNodePinValueAsync(
                executionId,
                srcNode.Id,
                conn.SourcePin,
                scope,
                ct
            ) ?? (scope != null ? await memoryStore.GetNodePinValueAsync(
                executionId,
                srcNode.Id,
                conn.SourcePin,
                null,
                ct
            ) : null);

            if (val == null && scope != null)
            {
                val = ScopeContextResolver.ResolveFromScope(scope, conn.SourcePin);
            }

            if (val == null && (string.Equals(srcNode.Kind, PipelineNodeKind.Start, StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(srcNode.RefId, "Start", StringComparison.OrdinalIgnoreCase)))
            {
                val = await memoryStore.GetStartInputAsync(executionId, conn.SourcePin, ct);

                if (val == null && pipeline.Inputs != null)
                {
                    var startInputDef = pipeline.Inputs.FirstOrDefault(i =>
                        string.Equals(i.Key, conn.SourcePin, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(i.Label, conn.SourcePin, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(NormalizePin(i.Key), NormalizePin(conn.SourcePin), StringComparison.OrdinalIgnoreCase) ||
                        (normalizedLabel != null && string.Equals(NormalizePin(i.Key), normalizedLabel, StringComparison.OrdinalIgnoreCase)));

                    if (startInputDef?.DefaultValue != null)
                    {
                        val = startInputDef.DefaultValue;
                    }
                }
            }

            return val;
        }

        var isArrayPin = pinDef?.Cardinality == PinCardinality.Array;
        var matchingConnections = pipeline.Edges.Where(e =>
            e.TargetPipelineNodeId == nodeId &&
            (string.Equals(e.TargetPin, pinKey, StringComparison.OrdinalIgnoreCase) ||
             string.Equals(NormalizePin(e.TargetPin), normalizedTarget, StringComparison.OrdinalIgnoreCase) ||
             (normalizedLabel != null && string.Equals(NormalizePin(e.TargetPin), normalizedLabel, StringComparison.OrdinalIgnoreCase)) ||
             (pinDef?.Id != null && string.Equals(e.TargetPin, pinDef.Id, StringComparison.OrdinalIgnoreCase)) ||
             (pinDef?.Label != null && string.Equals(e.TargetPin, pinDef.Label, StringComparison.OrdinalIgnoreCase)))).ToList();

        if (matchingConnections.Count > 0)
        {
            if (isArrayPin && matchingConnections.Count > 1)
            {
                var aggregatedList = new List<object?>();
                foreach (var conn in matchingConnections)
                {
                    var item = await ResolveConnectionAsync(conn);
                    if (item == null) continue;

                    if (item is IEnumerable enumVal && !(item is string))
                    {
                        foreach (var sub in enumVal) aggregatedList.Add(sub);
                    }
                    else if (item is JsonElement je && je.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var sub in je.EnumerateArray()) aggregatedList.Add(sub);
                    }
                    else
                    {
                        aggregatedList.Add(item);
                    }
                }
                resolvedValue = aggregatedList;
            }
            else
            {
                resolvedValue = await ResolveConnectionAsync(matchingConnections[0]);
            }
        }

        // 2. Check Inline Node Config (if not wired)
        if (resolvedValue == null && node.Config != null)
        {
            resolvedValue = InlineConfigResolver.ResolveFromConfig(node.Config, pinKey);
        }

        // 3. Check Scope Context (ForEach Key, Value, Index, Iteration Variables - if not wired)
        if (resolvedValue == null && scope != null)
        {
            resolvedValue = ScopeContextResolver.ResolveFromScope(scope, pinKey);
        }

        // 4. Check Runtime / Start Inputs
        if (resolvedValue == null)
        {
            resolvedValue = await memoryStore.GetStartInputAsync(executionId, pinKey, ct)
                            ?? await memoryStore.GetStartInputAsync(executionId, $"{nodeId}:{pinKey}", ct);
        }

        // 6. Check Default Value from Pin Definition
        if (resolvedValue == null)
        {
            pinDef ??= FindPinDefinition(node, pinKey);
            if (pinDef?.DefaultValue != null)
            {
                resolvedValue = pinDef.DefaultValue;
            }
        }

        // 7. Post-Processing: Asset resolution & Cardinality boxing
        if (resolvedValue != null)
        {
            resolvedValue = await assetResolver.ResolveAssetIfApplicableAsync(resolvedValue, ct);

            pinDef ??= FindPinDefinition(node, pinKey);
            resolvedValue = PinTypeCoercer.Coerce(resolvedValue, pinDef);


            // Memoize resolved value in memory store
            await memoryStore.SetNodePinValueAsync(executionId, nodeId, pinKey, resolvedValue, scope, ct);
        }

        return resolvedValue;
    }

    public async Task<Dictionary<string, object?>> ResolveAllPinsAsync(
        Guid executionId,
        Guid nodeId,
        IEnumerable<string>? requestedPinKeys = null,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var pinKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (requestedPinKeys != null)
        {
            foreach (var k in requestedPinKeys)
            {
                if (!string.IsNullOrWhiteSpace(k)) pinKeys.Add(k);
            }
        }

        var pipeline = await graphProvider.GetPipelineByExecutionIdAsync(executionId, ct);
        var node = pipeline?.Nodes.FirstOrDefault(n => n.Id == nodeId);

        if (node != null)
        {
            // 1. From Built-in Tool Registry
            var tool = toolRegistry.Get(node.RefId);
            if (tool != null)
            {
                foreach (var input in tool.Inputs)
                {
                    pinKeys.Add(input.Id);
                }
            }

            // 2. From Incoming Edges (wires connected to this node)
            if (pipeline?.Edges != null)
            {
                foreach (var edge in pipeline.Edges.Where(e => e.TargetPipelineNodeId == nodeId))
                {
                    if (!string.IsNullOrWhiteSpace(edge.TargetPin))
                    {
                        pinKeys.Add(edge.TargetPin);
                    }
                }
            }

            // 3. From Inline Node Config JSON keys
            if (node.Config != null)
            {
                try
                {
                    if (node.Config.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var prop in node.Config.RootElement.EnumerateObject())
                        {
                            pinKeys.Add(prop.Name);
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to enumerate node config keys for node {NodeId}", nodeId);
                }
            }
        }

        logger.LogInformation("Resolving all pins for node {NodeId} in execution {ExecId}. Found keys: [{Keys}]",
            nodeId, executionId, string.Join(", ", pinKeys));

        foreach (var pinKey in pinKeys)
        {
            var val = await ResolvePinAsync(executionId, nodeId, pinKey, scope, ct);
            if (val != null)
            {
                result[pinKey] = val;
                logger.LogInformation("Resolved pin '{PinKey}' for node {NodeId} -> {Value}",
                    pinKey, nodeId, val is string s && s.Length > 100 ? s[..100] + "..." : val);
            }
        }

        return result;
    }

    private PinDefinition? FindPinDefinition(PipelineNode node, string pinKey)
    {
        var tool = toolRegistry.Get(node.RefId);
        if (tool != null)
        {
            var normalized = NormalizePin(pinKey);
            return tool.Inputs.FirstOrDefault(p =>
                string.Equals(p.Id, pinKey, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(p.Label, pinKey, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(NormalizePin(p.Id), normalized, StringComparison.OrdinalIgnoreCase));
        }

        return null;
    }

    private static string NormalizePin(string pinKey)
    {
        return pinKey.Replace(" ", "").Replace("_", "").Replace("-", "");
    }
}
