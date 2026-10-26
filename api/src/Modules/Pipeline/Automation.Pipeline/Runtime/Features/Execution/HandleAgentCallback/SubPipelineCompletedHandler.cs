using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Runtime.Orchestrator;
using Automation.Pipeline.Runtime.Orchestrator.Dispatchers;
using Automation.Pipeline.Runtime.Orchestrator.SubPipeline;
using Automation.Pipeline.Runtime.State.Messages;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;

namespace Automation.Pipeline.Runtime.Features.Execution.HandleAgentCallback;

[NonTransactional]
public class SubPipelineCompletedHandler(
    PipelineDbContext db,
    IPipelineOrchestrator orchestrator,
    SubPipelineDispatcher subPipelineDispatcher,
    ISubPipelineCompletionNotifier subPipelineNotifier,
    ILogger<SubPipelineCompletedHandler> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task HandleAsync(SubPipelineCompletedMessage message, CancellationToken ct)
    {
        logger.LogInformation(
            "SubPipelineCompletedHandler received callback for Parent: {ParentId}, Child: {ChildId}, Status: {Status}",
            message.ParentExecutionId,
            message.ChildExecutionId,
            message.ChildStatus
        );

        var parent = await db.PipelineExecutions
            .FirstOrDefaultAsync(x => x.Id == message.ParentExecutionId, ct);

        if (parent == null)
        {
            logger.LogWarning("Parent execution {ParentId} not found. Skipping callback.", message.ParentExecutionId);
            return;
        }

        // Idempotency check: Parent must be WaitingForSubPipeline and CurrentBatchId matches ChildId
        if (parent.Status != ExecutionStatus.WaitingForSubPipeline)
        {
            logger.LogInformation(
                "Parent execution {ParentId} is not in WaitingForSubPipeline status (current: {Status}). Skipping.",
                parent.Id,
                parent.Status
            );
            return;
        }

        var expectedBatchId = message.ChildExecutionId.ToString();
        if (!string.Equals(parent.CurrentBatchId, expectedBatchId, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning(
                "Parent execution {ParentId} CurrentBatchId ({BatchId}) does not match ChildExecutionId ({ChildId}). Skipping.",
                parent.Id,
                parent.CurrentBatchId,
                message.ChildExecutionId
            );
            return;
        }

        var child = await db.PipelineExecutions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == message.ChildExecutionId, ct);

        if (child == null)
        {
            logger.LogError("Child execution {ChildId} not found in DB.", message.ChildExecutionId);
            return;
        }

        var macroNodeId = child.TriggeredByNodeId ?? Guid.Empty;

        // 1. Child chạy thành công
        if (message.ChildStatus == ExecutionStatus.Succeeded)
        {
            logger.LogInformation(
                "Child execution {ChildId} succeeded. Completing macro node {MacroNodeId} and resuming Parent {ParentId}.",
                child.Id,
                macroNodeId,
                parent.Id
            );

            if (macroNodeId != Guid.Empty)
            {
                await subPipelineDispatcher.CompleteFromChildAsync(
                    parent,
                    child,
                    macroNodeId,
                    scope: null,
                    ct
                );
            }

            parent.CurrentBatchId = null;
            await db.SaveChangesAsync(ct);

            // Tiếp tục chuỗi segment kế tiếp của Parent
            await orchestrator.ExecuteOrResumeAsync(parent.Id, ct: ct);
            return;
        }

        // 2. Child thất bại hoặc bị hủy
        var failReason = message.ErrorMessage
            ?? child.ErrorMessage
            ?? $"Child Sub-Pipeline ended with status: {message.ChildStatus}.";

        logger.LogError(
            "Child execution {ChildId} ended with {Status}. Failing Parent {ParentId}: {Reason}",
            child.Id,
            message.ChildStatus,
            parent.Id,
            failReason
        );

        if (macroNodeId != Guid.Empty)
        {
            await subPipelineDispatcher.RecordNodeFailureAsync(
                parent.Id,
                parent.PipelineId,
                macroNodeId,
                failReason,
                ct
            );
        }

        JsonDocument? failSnapshot = null;
        try
        {
            failSnapshot = await orchestrator.CaptureExecutionStateSnapshotAsync(parent, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to capture execution state snapshot on child failure for parent {ParentId}", parent.Id);
        }

        parent.CurrentBatchId = null;
        if (message.ChildStatus == ExecutionStatus.Cancelled)
        {
            parent.MarkCancelled();
        }
        else
        {
            parent.MarkFailed(failReason, failSnapshot);
        }

        await db.SaveChangesAsync(ct);

        if (hubContext != null)
        {
            try
            {
                await hubContext.Clients.Group($"pipeline_{parent.PipelineId}").SendAsync(
                    "PipelineExecutionFinished",
                    new
                    {
                        executionId = parent.Id,
                        pipelineId = parent.PipelineId,
                        status = (int)parent.Status,
                        errorMessage = failReason,
                        finishedAt = parent.FinishedAt,
                        executionState = failSnapshot
                    },
                    ct
                );
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to broadcast PipelineExecutionFinished via SignalR for parent {ParentId}", parent.Id);
            }
        }

        // Đệ quy lan truyền tiếp nếu Parent lại là con của một Pipeline khác (Nested SubPipeline)
        await subPipelineNotifier.NotifyIfChildAsync(parent, ct);
    }
}

