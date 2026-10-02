using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Tools;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.DataResolver.Resolvers;

public class PureNodeResolver(
    IToolRegistry toolRegistry,
    IExecutionMemoryStore memoryStore,
    IPipelineGraphProvider graphProvider,
    ILogger<PureNodeResolver> logger
)
{
    private static readonly AsyncLocal<HashSet<Guid>?> CallStack = new();

    public async Task<object?> ResolvePureNodeOutputAsync(
        Guid executionId,
        PipelineNode pureNode,
        string requestedPinKey,
        ScopeContext? scope,
        IPinValueResolver pinResolver,
        CancellationToken ct = default
    )
    {
        var stack = CallStack.Value ??= [];
        if (!stack.Add(pureNode.Id))
        {
            logger.LogError("Cyclic dependency detected during pure node evaluation at Node {NodeId} ({RefId})", pureNode.Id, pureNode.RefId);
            return null;
        }

        try
        {
            var tool = toolRegistry.Get(pureNode.RefId);
            if (tool == null || !tool.IsPure)
            {
                logger.LogWarning("Node {NodeId} with RefId '{RefId}' is not a registered pure tool.", pureNode.Id, pureNode.RefId);
                return null;
            }

            var frozenGraph = graphProvider.GetFrozenGraph(executionId);
            bool isDynamic = false;

            if (frozenGraph != null)
            {
                isDynamic = frozenGraph.DynamicPureNodeIds.Contains(pureNode.Id);
            }
            else
            {
                var pipeline = await graphProvider.GetPipelineByIdAsync(pureNode.PipelineId, ct);
                if (pipeline != null)
                {
                    var dynamicNodes = Analysis.PipelineGraphAnalyzer.AnalyzeDynamicNodes(pipeline, toolRegistry);
                    isDynamic = dynamicNodes.Contains(pureNode.Id);
                }
            }

            // 1. Check cache (Memoization) - only for static pure nodes
            if (!isDynamic)
            {
                var cached = await memoryStore.GetNodePinValueAsync(executionId, pureNode.Id, requestedPinKey, scope, ct);
                if (cached != null)
                {
                    return cached;
                }
            }

            // 2. Resolve all input pins for this Pure Node recursively
            var inputs = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            // 2a. Resolve from declared Tool Inputs
            foreach (var inPin in tool.Inputs)
            {
                var pinVal = await pinResolver.ResolvePinAsync(executionId, pureNode.Id, inPin.Id, scope, ct);
                if (pinVal != null)
                {
                    inputs[inPin.Id] = pinVal;
                    if (!string.IsNullOrEmpty(inPin.Label))
                    {
                        inputs[inPin.Label] = pinVal;
                    }
                }
            }

            // 2b. Also resolve any incoming connections directly
            var allResolved = await pinResolver.ResolveAllPinsAsync(executionId, pureNode.Id, scope: scope, ct: ct);
            foreach (var (k, v) in allResolved)
            {
                if (v != null && !inputs.ContainsKey(k))
                {
                    inputs[k] = v;
                }
            }

            // 2c. Also pass node.Config as input properties if available
            if (pureNode.Config != null && pureNode.Config.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in pureNode.Config.RootElement.EnumerateObject())
                {
                    if (!inputs.ContainsKey(prop.Name))
                    {
                        inputs[prop.Name] = InlineConfigResolver.NormalizeJsonElement(prop.Value) ?? prop.Value.GetRawText();
                    }
                }
            }

            logger.LogInformation("Executing Pure Node [{ToolLabel}] ({NodeId}) on-demand for pin [{PinKey}] (IsDynamic: {IsDynamic})",
                tool.Label, pureNode.Id, requestedPinKey, isDynamic);

            // 3. Execute Pure Tool with correct ProjectId and Runner/Agent
            var execution = await graphProvider.GetExecutionByIdAsync(executionId, ct);
            var agentId = execution?.AgentId ?? Guid.Empty;
            var projectId = frozenGraph?.ProjectId ?? (await graphProvider.GetPipelineByIdAsync(pureNode.PipelineId, ct))?.ProjectId ?? Guid.Empty;

            var toolContext = new ToolExecutionContext(executionId, pureNode.PipelineId, agentId, ct, pureNode.Id, projectId);
            Dictionary<string, object> outputs;
            try
            {
                outputs = await tool.ExecuteAsync(inputs, toolContext);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to execute Pure Tool [{ToolLabel}] ({NodeId})", tool.Label, pureNode.Id);
                return null;
            }

            // 4. Save all outputs to memory store for this scope (Memoization) - only for static pure nodes
            var outputsDict = outputs.ToDictionary(k => k.Key, v => (object?)v.Value);
            if (!isDynamic)
            {
                await memoryStore.SetNodeAllOutputsAsync(executionId, pureNode.Id, outputsDict, scope, ct);
            }

            // 5. Return the requested pin
            if (outputsDict.TryGetValue(requestedPinKey, out var result) && result != null)
            {
                return result;
            }

            var canonicalTarget = CanonicalPinKey.Normalize(requestedPinKey);
            var match = outputsDict.FirstOrDefault(x => CanonicalPinKey.Normalize(x.Key) == canonicalTarget);

            return match.Value;
        }
        finally
        {
            stack.Remove(pureNode.Id);
        }
    }
}
