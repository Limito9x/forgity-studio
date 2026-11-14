using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.BuildTime.Features.CustomNodes.Events;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.BuildTime.Features.CustomNodes.Handlers;

public class ReconcilePipelineEdgesHandler(
    PipelineDbContext db,
    ILogger<ReconcilePipelineEdgesHandler> logger
)
{
    public async Task HandleAsync(NodeDefinitionPinsChangedEvent @event, CancellationToken ct)
    {
        logger.LogInformation("[Wolverine:Reconcile] Received event for NodeKey: {NodeKey}, NodeDefinitionId: {NodeDefinitionId}, Strategy: {Strategy}",
            @event.NodeKey, @event.NodeDefinitionId, @event.Strategy);

        // Nạp tất cả các Pipelines có chứa node tham chiếu đến NodeKey này
        var allPipelines = await db.Pipelines.ToListAsync(ct);
        var affectedPipelines = allPipelines
            .Where(p => p.GraphData.Nodes.Any(n => string.Equals(n.RefId, @event.NodeKey, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        var pipelineCount = affectedPipelines.Count;
        var nodeCount = affectedPipelines.Sum(p => p.GraphData.Nodes.Count(n => n.RefId == @event.NodeKey));

        logger.LogDebug("[Wolverine:Reconcile] Found {NodeCount} nodes in {PipelineCount} pipelines.", nodeCount, pipelineCount);

        if (nodeCount == 0)
        {
            logger.LogInformation("[Wolverine:Reconcile] No pipeline nodes found for NodeKey: {NodeKey}. Nothing to reconcile.", @event.NodeKey);
            return;
        }

        var preservedCount = 0;
        var detachedCount = 0;
        var validInputPins = @event.NewInputPinIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var validOutputPins = @event.NewOutputPinIds.ToHashSet(StringComparer.OrdinalIgnoreCase);

        bool IsInputValid(string pin) => IsExecOrSystemPin(pin) || validInputPins.Contains(pin);
        bool IsOutputValid(string pin) => IsExecOrSystemPin(pin) || validOutputPins.Contains(pin);

        foreach (var pipeline in affectedPipelines)
        {
            var nodeIds = pipeline.GraphData.Nodes
                .Where(n => n.RefId == @event.NodeKey)
                .Select(n => n.Id)
                .ToHashSet();

            if (nodeIds.Count == 0) continue;

            if (@event.Strategy == EdgeReconciliationStrategy.UnpinAll)
            {
                var removed = pipeline.GraphData.Edges.RemoveAll(e =>
                    nodeIds.Contains(e.SourcePipelineNodeId) || nodeIds.Contains(e.TargetPipelineNodeId));
                detachedCount += removed;
            }
            else
            {
                var removed = pipeline.GraphData.Edges.RemoveAll(e =>
                {
                    var isSource = nodeIds.Contains(e.SourcePipelineNodeId);
                    var isTarget = nodeIds.Contains(e.TargetPipelineNodeId);

                    if (isSource && isTarget)
                    {
                        var sourcePinValid = IsOutputValid(e.SourcePin);
                        var targetPinValid = IsInputValid(e.TargetPin);
                        return !sourcePinValid || !targetPinValid;
                    }
                    if (isSource)
                    {
                        return !IsOutputValid(e.SourcePin);
                    }
                    if (isTarget)
                    {
                        return !IsInputValid(e.TargetPin);
                    }
                    return false;
                });

                detachedCount += removed;
                preservedCount += pipeline.GraphData.Edges.Count;
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
