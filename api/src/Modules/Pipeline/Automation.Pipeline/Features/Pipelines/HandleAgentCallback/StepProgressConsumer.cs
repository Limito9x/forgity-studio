using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.HandleAgentCallback;

[NonTransactional]
public class StepProgressConsumer(
    PipelineDbContext db,
    Engine.IExecutionStateStore stateStore,
    ILogger<StepProgressConsumer> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task HandleAsync(StepProgressMessage message, CancellationToken ct)
    {
        logger.LogInformation(
            "Received StepProgressMessage for StageExecutionId: {StageExecutionId}, StepExecutionId: {StepId}, Status: {Status}",
            message.StageExecutionId, message.StepExecutionId, message.Status
        );

        var execution = await db.PipelineExecutions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.CurrentBatchId == message.StageExecutionId, ct);

        if (execution == null)
        {
            logger.LogWarning(
                "No PipelineExecution found waiting for StageExecutionId: {StageExecutionId}",
                message.StageExecutionId
            );
            return;
        }

        if (Guid.TryParse(message.StepExecutionId, out var nodeId))
        {
            try
            {
                await stateStore.SetNodeStatusAsync(execution.Id, nodeId, message.Status, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to update node status in state store for node {NodeId}", nodeId);
            }

            if (hubContext != null)
            {
                try
                {
                    var isRunning = message.Status.Equals("running", StringComparison.OrdinalIgnoreCase);
                    var isFinished = message.Status.Equals("succeeded", StringComparison.OrdinalIgnoreCase) ||
                                     message.Status.Equals("failed", StringComparison.OrdinalIgnoreCase);

                    await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                        "PipelineNodeExecutionUpdated",
                        new
                        {
                            executionId = execution.Id,
                            pipelineId = execution.PipelineId,
                            nodeId,
                            status = message.Status,
                            startedAt = isRunning ? DateTimeOffset.UtcNow : (DateTimeOffset?)null,
                            finishedAt = isFinished ? DateTimeOffset.UtcNow : (DateTimeOffset?)null
                        },
                        ct
                    );
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to broadcast PipelineNodeExecutionUpdated via SignalR for node {NodeId}", nodeId);
                }
            }
        }
    }
}
