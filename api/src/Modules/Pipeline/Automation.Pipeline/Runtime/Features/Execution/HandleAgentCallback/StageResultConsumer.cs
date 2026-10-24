using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Runtime.State.Messages;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
namespace Automation.Pipeline.Runtime.Features.Execution.HandleAgentCallback;

[NonTransactional]
public class StageResultConsumer(
    PipelineDbContext db,
    IPipelineOrchestrator orchestrator,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    ILogger<StageResultConsumer> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task HandleAsync(StageResultMessage message, CancellationToken ct)
    {
        logger.LogInformation("Received StageResultMessage for StageExecutionId: {StageExecutionId}, Succeeded: {Succeeded}",
            message.StageExecutionId, message.Succeeded);

        PipelineExecution? execution = null;
        if (Guid.TryParse(message.PipelineExecutionId, out var parsedExecId))
        {
            execution = await db.PipelineExecutions
                .FirstOrDefaultAsync(x => x.Id == parsedExecId, ct);
        }

        if (execution == null)
        {
            execution = await db.PipelineExecutions
                .FirstOrDefaultAsync(x => x.CurrentBatchId == message.StageExecutionId, ct);
        }

        if (execution == null)
        {
            logger.LogWarning("No PipelineExecution found for StageExecutionId: {StageExecutionId} (ExecId: {ExecId})",
                message.StageExecutionId, message.PipelineExecutionId);
            return;
        }

        if (execution.Status != ExecutionStatus.WaitingForRunner && execution.Status != ExecutionStatus.Running)
        {
            logger.LogWarning("PipelineExecution {ExecutionId} is in status {Status}, skipping callback", execution.Id, execution.Status);
            return;
        }

        var state = PipelineExecutionState.FromJsonDocument(execution.ExecutionState);

        // 1. Process all received step results first so their statuses, outputs, errors and logs are recorded
        foreach (var stepResult in message.StepResults)
        {
            if (Guid.TryParse(stepResult.StepExecutionId, out var nodeId))
            {
                if (stepResult.Outputs != null && stepResult.Outputs.Count > 0)
                {
                    state.SetNodeOutputs(nodeId, stepResult.Outputs);
                    await stateStore.SetNodeOutputsAsync(execution.Id, nodeId, stepResult.Outputs, ct);
                    await memoryStore.SetNodeAllOutputsAsync(execution.Id, nodeId, stepResult.Outputs, scope: null, ct: ct);
                }

                if (!string.IsNullOrWhiteSpace(stepResult.ErrorMessage) || !stepResult.Succeeded)
                {
                    var nodeErr = !string.IsNullOrWhiteSpace(stepResult.ErrorMessage) ? stepResult.ErrorMessage : stepResult.Log;
                    if (!string.IsNullOrWhiteSpace(nodeErr))
                    {
                        await stateStore.SetNodeErrorAsync(execution.Id, nodeId, nodeErr, ct);
                    }
                }

                if (!string.IsNullOrWhiteSpace(stepResult.Log))
                {
                    await stateStore.SetNodeLogAsync(execution.Id, nodeId, stepResult.Log, ct);
                }

                var statusStr = stepResult.Succeeded ? ExecutionStatus.Succeeded.ToString() : ExecutionStatus.Failed.ToString();
                await stateStore.SetNodeStatusAsync(execution.Id, nodeId, statusStr, ct);

                if (hubContext != null)
                {
                    try
                    {
                        await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                            "PipelineNodeExecutionUpdated",
                            new
                            {
                                executionId = execution.Id,
                                pipelineId = execution.PipelineId,
                                nodeId,
                                status = stepResult.Succeeded ? "succeeded" : "failed",
                                outputs = stepResult.Outputs,
                                finishedAt = DateTimeOffset.UtcNow,
                                errorMessage = stepResult.Succeeded ? null : (!string.IsNullOrWhiteSpace(stepResult.ErrorMessage) ? stepResult.ErrorMessage : stepResult.Log)
                            },
                            ct
                        );
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to broadcast PipelineNodeExecutionUpdated for node {NodeId}", nodeId);
                    }
                }
            }
        }

        // 2. Handle failure if Stage was not successful
        if (!message.Succeeded)
        {
            var err = message.ErrorMessage ?? "Agent execution failed with unspecified error.";
            JsonDocument? failSnapshot = null;
            try
            {
                failSnapshot = await orchestrator.CaptureExecutionStateSnapshotAsync(execution, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to capture execution state snapshot on stage failure for {ExecutionId}", execution.Id);
            }

            execution.MarkFailed(err, failSnapshot);
            await db.SaveChangesAsync(ct);
            logger.LogError("PipelineExecution {ExecutionId} failed during Agent stage {StageId}: {Error}", execution.Id, message.StageExecutionId, err);

            if (hubContext != null)
            {
                try
                {
                    await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                        "PipelineExecutionFinished",
                        new
                        {
                            executionId = execution.Id,
                            pipelineId = execution.PipelineId,
                            status = "failed",
                            errorMessage = err,
                            finishedAt = DateTimeOffset.UtcNow,
                            executionState = failSnapshot
                        },
                        ct
                    );
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to broadcast PipelineExecutionFinished via SignalR for execution {ExecutionId}", execution.Id);
                }
            }

            return;
        }

        await stateStore.SaveFullStateAsync(execution.Id, state, ct);
        execution.SetState(state.ToJsonDocument(), execution.NextNodeIndex);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Resuming PipelineExecution {ExecutionId} from node index {NextNodeIndex}", execution.Id, execution.NextNodeIndex);

        // Resume orchestrator
        await orchestrator.ExecuteOrResumeAsync(execution.Id, ct: ct);
    }
}
