using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Runtime.State.Messages;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
namespace Automation.Pipeline.Runtime.Features.Execution.HandleAgentCallback;

[NonTransactional]
public class StageTimeoutHandler(
    PipelineDbContext db,
    ILogger<StageTimeoutHandler> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task HandleAsync(StageTimeoutCheckMessage message, CancellationToken ct)
    {
        var execution = await db.PipelineExecutions
            .FirstOrDefaultAsync(x => x.Id == message.ExecutionId, ct);

        if (execution == null) return;

        // Chỉ xử lý timeout nếu execution VẪN đang trong trạng thái WaitingForRunner hoặc Running
        // VÀ StageExecutionId vẫn là batch đang chờ (nghĩa là Runner chưa bao giờ hoàn tất stage này)
        if ((execution.Status == ExecutionStatus.WaitingForRunner || execution.Status == ExecutionStatus.Running)
            && execution.CurrentBatchId == message.StageExecutionId)
        {
            var errMsg = $"Stage timed out: Runner did not report back for stage '{message.StageExecutionId}' within 30 minutes.";
            logger.LogError("PipelineExecution {ExecutionId} aborted by timeout watchdog for stage {StageId}", execution.Id, message.StageExecutionId);

            execution.MarkFailed(errMsg);
            await db.SaveChangesAsync(ct);

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
                            errorMessage = errMsg,
                            finishedAt = DateTimeOffset.UtcNow
                        },
                        ct
                    );
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to broadcast PipelineExecutionFinished on timeout for execution {ExecutionId}", execution.Id);
                }
            }
        }
    }
}
