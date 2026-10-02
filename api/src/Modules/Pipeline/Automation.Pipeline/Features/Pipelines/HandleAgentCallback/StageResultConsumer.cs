using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.HandleAgentCallback;

[NonTransactional]
public class StageResultConsumer(
    PipelineDbContext db,
    Engine.Orchestrator.IPipelineOrchestrator orchestrator,
    Engine.DataResolver.IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    ILogger<StageResultConsumer> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task HandleAsync(StageResultMessage message, CancellationToken ct)
    {
        logger.LogInformation("Received StageResultMessage for StageExecutionId: {StageExecutionId}, Succeeded: {Succeeded}",
            message.StageExecutionId, message.Succeeded);

        var execution = await db.PipelineExecutions
            .FirstOrDefaultAsync(x => x.CurrentBatchId == message.StageExecutionId, ct);

        if (execution == null)
        {
            logger.LogWarning("No PipelineExecution found waiting for StageExecutionId: {StageExecutionId}", message.StageExecutionId);
            return;
        }

        if (execution.Status != ExecutionStatus.WaitingForRunner && execution.Status != ExecutionStatus.Running)
        {
            logger.LogWarning("PipelineExecution {ExecutionId} is in status {Status}, skipping callback", execution.Id, execution.Status);
            return;
        }

        if (!message.Succeeded)
        {
            var err = message.ErrorMessage ?? "Agent execution failed with unspecified error.";
            execution.MarkFailed(err);
            await db.SaveChangesAsync(ct);
            logger.LogError("PipelineExecution {ExecutionId} failed during Agent stage {StageId}: {Error}", execution.Id, message.StageExecutionId, err);
            return;
        }

        var state = PipelineExecutionState.FromJsonDocument(execution.ExecutionState);

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

                var outputDoc = JsonDocument.Parse(JsonSerializer.Serialize(stepResult.Outputs ?? new()));
                JsonDocument? logDoc = null;
                if (!string.IsNullOrWhiteSpace(stepResult.Log))
                {
                    try { logDoc = JsonDocument.Parse(JsonSerializer.Serialize(stepResult.Log)); } catch { /* ignore */ }
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
                                errorMessage = stepResult.Succeeded ? null : stepResult.Log
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

        await stateStore.SaveFullStateAsync(execution.Id, state, ct);
        execution.SetState(state.ToJsonDocument(), execution.NextNodeIndex);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Resuming PipelineExecution {ExecutionId} from node index {NextNodeIndex}", execution.Id, execution.NextNodeIndex);

        // Resume orchestrator
        await orchestrator.ExecuteOrResumeAsync(execution.Id, ct: ct);
    }
}
