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

        var frozenGraph = graphProvider.GetFrozenGraph(executionId);
        PipelineNode? node = null;
        IReadOnlyList<PipelineEdge> edges = [];

        if (frozenGraph != null)
        {
            frozenGraph.NodesById.TryGetValue(nodeId, out node);
            if (frozenGraph.InEdgesByTargetNode.TryGetValue(nodeId, out var targetEdges))
            {
                edges = targetEdges;
            }
        }
        else
        {
            var pipeline = await graphProvider.GetPipelineByExecutionIdAsync(executionId, ct);
            if (pipeline == null)
            {
                logger.LogWarning("Pipeline not found for execution {ExecutionId}", executionId);
                return null;
            }

            node = pipeline.Nodes.FirstOrDefault(n => n.Id == nodeId);
            edges = pipeline.Edges.Where(e => e.TargetPipelineNodeId == nodeId).ToList();
        }

        if (node == null)
        {
            logger.LogWarning("Node {NodeId} not found in execution {ExecutionId}", nodeId, executionId);
            return null;
        }

        object? resolvedValue = null;

        // 1. Check Upstream Connections -> Recursive Pull (Wires have highest priority)
        var canonicalTarget = CanonicalPinKey.Normalize(pinKey);
        var pinDef = FindPinDefinition(node, pinKey);
        if (pinDef == null)
        {
            var customInputs = await graphProvider.GetCustomNodeInputsAsync(node, ct);
            pinDef = customInputs.FirstOrDefault(x => CanonicalPinKey.IsMatching(x.Id, pinKey) ||
                CanonicalPinKey.IsMatching(x.Label, pinKey));
        }
        var canonicalLabel = pinDef?.Label != null ? CanonicalPinKey.Normalize(pinDef.Label) : null;

        async Task<object?> ResolveConnectionAsync(PipelineEdge conn)
        {
            PipelineNode? srcNode = null;
            if (frozenGraph != null)
            {
                frozenGraph.NodesById.TryGetValue(conn.SourcePipelineNodeId, out srcNode);
            }
            else
            {
                var pipe = await graphProvider.GetPipelineByExecutionIdAsync(executionId, ct);
                srcNode = pipe?.Nodes.FirstOrDefault(n => n.Id == conn.SourcePipelineNodeId);
            }

            if (srcNode == null) return null;

            var isPure = frozenGraph != null
                ? frozenGraph.PureNodeIds.Contains(srcNode.Id)
                : toolRegistry.Get(srcNode.RefId) is { IsPure: true };

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

            if (val == null && (srcNode.Kind == PipelineNodeKind.Start ||
                                string.Equals(srcNode.RefId, "Start", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(srcNode.RefId, "GetInput", StringComparison.OrdinalIgnoreCase) ||
                                (srcNode.Kind == PipelineNodeKind.Capsule && srcNode.Metadata != null && srcNode.Metadata.RootElement.TryGetProperty("category", out var catProp) && string.Equals(catProp.GetString(), "Input", StringComparison.OrdinalIgnoreCase))))
            {
                var targetInputKey = conn.SourcePin;
                if (srcNode.Config != null && srcNode.Config.RootElement.ValueKind == JsonValueKind.Object)
                {
                    if (srcNode.Config.RootElement.TryGetProperty("key", out var kProp) ||
                        srcNode.Config.RootElement.TryGetProperty("VariableName", out kProp))
                    {
                        var extractedKey = kProp.GetString();
                        if (!string.IsNullOrEmpty(extractedKey)) targetInputKey = extractedKey;
                    }
                }

                val = await memoryStore.GetStartInputAsync(executionId, targetInputKey, ct);

                if (val == null)
                {
                    if (frozenGraph != null)
                    {
                        if (frozenGraph.ParametersByKey.TryGetValue(targetInputKey, out var pDef) && pDef.DefaultValue != null)
                        {
                            val = pDef.DefaultValue;
                        }
                    }
                    else
                    {
                        var pipe = await graphProvider.GetPipelineByExecutionIdAsync(executionId, ct);
                        if (pipe?.Parameters != null)
                        {
                            var startInputDef = pipe.Parameters
                                .Where(p => p.Kind == PipelineParameterKind.Input)
                                .FirstOrDefault(i =>
                                    CanonicalPinKey.IsMatching(i.Key, targetInputKey) ||
                                    CanonicalPinKey.IsMatching(i.Label, targetInputKey) ||
                                    (canonicalLabel != null && CanonicalPinKey.IsMatching(i.Key, canonicalLabel)));

                            if (startInputDef?.DefaultValue != null)
                            {
                                val = startInputDef.DefaultValue;
                            }
                        }
                    }
                }
            }

            return val;
        }

        var isArrayPin = pinDef?.Cardinality == PinCardinality.Array;
        var matchingConnections = edges.Where(e =>
            CanonicalPinKey.IsMatching(e.TargetPin, pinKey) ||
            CanonicalPinKey.IsMatching(e.TargetPin, canonicalTarget) ||
            (canonicalLabel != null && CanonicalPinKey.IsMatching(e.TargetPin, canonicalLabel)) ||
            (pinDef?.Id != null && CanonicalPinKey.IsMatching(e.TargetPin, pinDef.Id)) ||
            (pinDef?.Label != null && CanonicalPinKey.IsMatching(e.TargetPin, pinDef.Label))).ToList();

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

        var fromInlineConfig = false;
        // 2. Check Inline Node Config (if not wired)
        if (resolvedValue == null && node.Config != null)
        {
            resolvedValue = InlineConfigResolver.ResolveFromConfig(node.Config, pinKey);
            fromInlineConfig = resolvedValue != null;
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

        // 5. Check Default Value from Pin Definition
        if (resolvedValue == null)
        {
            pinDef ??= FindPinDefinition(node, pinKey);
            if (pinDef?.DefaultValue != null)
            {
                resolvedValue = pinDef.DefaultValue;
            }
        }

        // 6. Post-Processing: Asset resolution & Cardinality boxing
        if (resolvedValue != null)
        {
            if (PipelineFileValue.IsFilePin(pinDef) || PipelineFileValue.TryGetLinkId(resolvedValue, out _))
            {
                var configKey = node.Config?.RootElement.EnumerateObject()
                    .Where(x => CanonicalPinKey.IsMatching(x.Name, pinKey)).Select(x => x.Name).FirstOrDefault();
                resolvedValue = !fromInlineConfig && resolvedValue is string runtimeAsset && Guid.TryParse(runtimeAsset, out var runtimeAssetId)
                    ? await assetResolver.ResolveRuntimeAssetAsync(runtimeAssetId, ct)
                    : await assetResolver.ResolveFileAsync(resolvedValue,
                        PipelineFileValue.Owner(node.Id, configKey ?? pinDef?.Id ?? pinKey), ct);
            }

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

        var frozenGraph = graphProvider.GetFrozenGraph(executionId);
        PipelineNode? node = null;
        if (frozenGraph != null)
        {
            frozenGraph.NodesById.TryGetValue(nodeId, out node);
        }
        else
        {
            var pipeline = await graphProvider.GetPipelineByExecutionIdAsync(executionId, ct);
            node = pipeline?.Nodes.FirstOrDefault(n => n.Id == nodeId);
        }

        if (node == null)
        {
            logger.LogWarning("Node {NodeId} not found in execution {ExecutionId}", nodeId, executionId);
            return result;
        }

        var pinKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (requestedPinKeys != null)
        {
            foreach (var pk in requestedPinKeys) pinKeys.Add(pk);
        }

        // Add pins from node.Config
        if (node.Config != null && node.Config.RootElement.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in node.Config.RootElement.EnumerateObject())
            {
                pinKeys.Add(prop.Name);
            }
        }

        // Add pins from incoming connections
        IReadOnlyList<PipelineEdge> inEdges = [];
        if (frozenGraph != null)
        {
            if (frozenGraph.InEdgesByTargetNode.TryGetValue(nodeId, out var targetEdges))
            {
                inEdges = targetEdges;
            }
        }
        else
        {
            var pipe = await graphProvider.GetPipelineByExecutionIdAsync(executionId, ct);
            if (pipe != null)
            {
                inEdges = pipe.Edges.Where(e => e.TargetPipelineNodeId == nodeId).ToList();
            }
        }

        foreach (var conn in inEdges)
        {
            if (!string.IsNullOrEmpty(conn.TargetPin))
            {
                pinKeys.Add(conn.TargetPin);
            }
        }

        // Add pins from Tool definition if registered
        var tool = toolRegistry.Get(node.RefId);
        if (tool != null)
        {
            foreach (var inPin in tool.Inputs)
            {
                pinKeys.Add(inPin.Id);
                if (!string.IsNullOrEmpty(inPin.Label))
                {
                    pinKeys.Add(inPin.Label);
                }
            }
        }

        // Resolve each pin
        foreach (var pinKey in pinKeys)
        {
            var value = await ResolvePinAsync(executionId, nodeId, pinKey, scope, ct);
            if (value != null)
            {
                result[pinKey] = value;
            }
        }

        return result;
    }

    private PinDefinition? FindPinDefinition(PipelineNode node, string pinKey)
    {
        var tool = toolRegistry.Get(node.RefId);
        if (tool == null) return null;

        var input = tool.Inputs.FirstOrDefault(i =>
            CanonicalPinKey.IsMatching(i.Id, pinKey) ||
            CanonicalPinKey.IsMatching(i.Label, pinKey));

        if (input != null) return input;

        return tool.Outputs.FirstOrDefault(o =>
            CanonicalPinKey.IsMatching(o.Id, pinKey) ||
            CanonicalPinKey.IsMatching(o.Label, pinKey));
    }
}
