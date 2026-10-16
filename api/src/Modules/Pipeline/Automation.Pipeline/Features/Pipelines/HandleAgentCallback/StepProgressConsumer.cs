using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.HandleAgentCallback;

[NonTransactional]
public class StepProgressConsumer(
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    ILogger<StepProgressConsumer> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task HandleAsync(StepProgressMessage message, CancellationToken ct)
    {
        logger.LogInformation(
            "Received StepProgressMessage for Execution: {ExecId}, Pipeline: {PipeId}, Step: {StepId}, Status: {Status}",
            message.PipelineExecutionId, message.PipelineId, message.StepExecutionId, message.Status
        );

        if (!Guid.TryParse(message.PipelineExecutionId, out var executionId) ||
            !Guid.TryParse(message.PipelineId, out var pipelineId) ||
            !Guid.TryParse(message.StepExecutionId, out var nodeId))
        {
            logger.LogWarning(
                "Invalid identifiers in StepProgressMessage: ExecutionId={ExecId}, PipelineId={PipeId}, StepId={StepId}",
                message.PipelineExecutionId, message.PipelineId, message.StepExecutionId
            );
            return;
        }

        // 1. Hot State: Lưu outputs vào Redis MemoryStore nếu có (Zero-DB)
        if (message.Outputs != null && message.Outputs.Count > 0)
        {
            try
            {
                await memoryStore.SetNodeAllOutputsAsync(executionId, nodeId, message.Outputs, scope: null, ct: ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to persist step outputs to MemoryStore for node {NodeId}", nodeId);
            }
        }

        // 2. Hot State: Cập nhật trạng thái node vào Redis StateStore
        try
        {
            await stateStore.SetNodeStatusAsync(executionId, nodeId, message.Status, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to update node status in StateStore for node {NodeId}", nodeId);
        }

        // 3. Realtime SignalR: Phát sóng ngay cho Web Canvas (< 1ms, Zero-DB)
        if (hubContext != null)
        {
            try
            {
                var isRunning = message.Status.Equals("running", StringComparison.OrdinalIgnoreCase);
                var isFinished = message.Status.Equals("succeeded", StringComparison.OrdinalIgnoreCase) ||
                                 message.Status.Equals("failed", StringComparison.OrdinalIgnoreCase);

                await hubContext.Clients.Group($"pipeline_{pipelineId}").SendAsync(
                    "PipelineNodeExecutionUpdated",
                    new
                    {
                        executionId,
                        pipelineId,
                        nodeId,
                        status = message.Status,
                        outputs = message.Outputs,
                        errorMessage = message.ErrorMessage,
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

