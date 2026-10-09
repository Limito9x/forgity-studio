using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Features.Nodes.Events;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Nodes.Handlers;

public class ReconcilePipelineEdgesHandler(
    PipelineDbContext db,
    ILogger<ReconcilePipelineEdgesHandler> logger
)
{
    public async Task HandleAsync(NodeDefinitionPinsChangedEvent @event, CancellationToken ct)
    {
        logger.LogInformation("[Wolverine:Reconcile] Received event for NodeKey: {NodeKey}, NodeDefinitionId: {NodeDefinitionId}, Strategy: {Strategy}",
            @event.NodeKey, @event.NodeDefinitionId, @event.Strategy);

        // Find all PipelineNodes referencing this NodeDefinition
        var pipelineNodes = await db.PipelineNodes
            .Where(n => n.RefId == @event.NodeKey)
            .ToListAsync(ct);

        var nodeCount = pipelineNodes.Count;
        var pipelineCount = pipelineNodes.Select(n => n.PipelineId).Distinct().Count();

        logger.LogDebug("[Wolverine:Reconcile] Found {NodeCount} nodes in {PipelineCount} pipelines.", nodeCount, pipelineCount);

        if (nodeCount == 0)
        {
            logger.LogInformation("[Wolverine:Reconcile] No pipeline nodes found for NodeKey: {NodeKey}. Nothing to reconcile.", @event.NodeKey);
            return;
        }

        var pipelineNodeIds = pipelineNodes.Select(n => n.Id).ToHashSet();

        // Find all edges connected to these nodes
        var edges = await db.PipelineEdges
            .Where(e => pipelineNodeIds.Contains(e.SourcePipelineNodeId) || pipelineNodeIds.Contains(e.TargetPipelineNodeId))
            .ToListAsync(ct);

        var preservedCount = 0;
        var detachedCount = 0;

        if (@event.Strategy == EdgeReconciliationStrategy.UnpinAll)
        {
            // Unpin all: remove all edges connected to these nodes
            detachedCount = edges.Count;
            db.PipelineEdges.RemoveRange(edges);
            logger.LogInformation("[Wolverine:Reconcile] UnpinAll strategy: Detaching all {EdgeCount} edges for NodeKey: {NodeKey}", detachedCount, @event.NodeKey);
        }
        else
        {
            // KeepCompatiblePins: only remove edges where the pin no longer exists or type changed
            // Exec pins and system control flow pins are ALWAYS preserved.
            var validInputPins = @event.NewInputPinIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var validOutputPins = @event.NewOutputPinIds.ToHashSet(StringComparer.OrdinalIgnoreCase);

            bool IsInputValid(string pin) => IsExecOrSystemPin(pin) || validInputPins.Contains(pin);
            bool IsOutputValid(string pin) => IsExecOrSystemPin(pin) || validOutputPins.Contains(pin);

            var edgesToRemove = edges.Where(e =>
            {
                var isSource = pipelineNodeIds.Contains(e.SourcePipelineNodeId);
                var isTarget = pipelineNodeIds.Contains(e.TargetPipelineNodeId);

                if (isSource && isTarget)
                {
                    // Edge connects two nodes of this definition (both ends)
                    var sourcePinValid = IsOutputValid(e.SourcePin);
                    var targetPinValid = IsInputValid(e.TargetPin);
                    return !sourcePinValid || !targetPinValid;
                }
                else if (isSource)
                {
                    // Edge source is this node definition
                    return !IsOutputValid(e.SourcePin);
                }
                else if (isTarget)
                {
                    // Edge target is this node definition
                    return !IsInputValid(e.TargetPin);
                }
                return false;
            }).ToList();

            detachedCount = edgesToRemove.Count;
            preservedCount = edges.Count - detachedCount;

            if (detachedCount > 0)
            {
                db.PipelineEdges.RemoveRange(edgesToRemove);
                logger.LogInformation("[Wolverine:Reconcile] KeepCompatiblePins strategy: Detaching {DetachedCount} incompatible edges, preserving {PreservedCount} edges for NodeKey: {NodeKey}",
                    detachedCount, preservedCount, @event.NodeKey);
            }
            else
            {
                logger.LogInformation("[Wolverine:Reconcile] KeepCompatiblePins strategy: All {PreservedCount} edges preserved for NodeKey: {NodeKey}", preservedCount, @event.NodeKey);
            }
        }

        await db.SaveChangesAsync(ct);

        logger.LogInformation("[Wolverine:Reconcile] Completed: Preserved {PreservedCount} edges, Detached {DetachedCount} edges for NodeKey: {NodeKey}",
            preservedCount, detachedCount, @event.NodeKey);
    }

    private static bool IsExecOrSystemPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var p = pin.Trim().ToLowerInvariant();
        return p is "exec" or "exec_in" or "exec_out" or "loop_body" or "completed"
            or "true" or "false" or "then" or "else" or "start" or "done" or "next" or "branch"
            or "runner"
            || p.StartsWith("exec_") || p.EndsWith("_exec");
    }
}