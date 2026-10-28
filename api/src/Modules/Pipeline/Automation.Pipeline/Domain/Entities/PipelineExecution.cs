using System.Text.Json;
using Automation.Pipeline.Domain.Enums;

namespace Automation.Pipeline.Domain.Entities;

public class PipelineExecution : BaseEntity
{
    public Guid PipelineId { get; set; }
    public Pipeline Pipeline { get; set; } = null!;
    public Guid? ParentExecutionId { get; set; }
    public PipelineExecution? ParentExecution { get; set; }
    public Guid? TriggeredByNodeId { get; set; }
    public ExecutionStatus Status { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public JsonDocument? ExecutionState { get; set; }
    public int NextNodeIndex { get; set; }
    public string? CurrentBatchId { get; set; }
    public string? ErrorMessage { get; set; }

    public PipelineExecution() { }

    public PipelineExecution(
        Guid pipelineId,
        Guid? parentExecutionId = null,
        Guid? triggeredByNodeId = null
    )
    {
        PipelineId = pipelineId;
        ParentExecutionId = parentExecutionId;
        TriggeredByNodeId = triggeredByNodeId;
        Status = ExecutionStatus.Pending;
        NextNodeIndex = 0;
    }

    public void Start()
    {
        Status = ExecutionStatus.Running;
        StartedAt = DateTimeOffset.UtcNow;
        FinishedAt = null;
        ErrorMessage = null;
    }

    public void SetState(JsonDocument state, int nextIndex, string? batchId = null)
    {
        ExecutionState = state;
        NextNodeIndex = nextIndex;
        CurrentBatchId = batchId;
    }

    public void MarkWaitingForRunner(string batchId, int nextIndex, JsonDocument state)
    {
        Status = ExecutionStatus.WaitingForRunner;
        CurrentBatchId = batchId;
        NextNodeIndex = nextIndex;
        ExecutionState = state;
    }

    public void MarkWaitingForSubPipeline(Guid childExecutionId, int nextIndex, JsonDocument state)
    {
        Status = ExecutionStatus.WaitingForSubPipeline;
        CurrentBatchId = childExecutionId.ToString();
        NextNodeIndex = nextIndex;
        ExecutionState = state;
    }

    public void Resume()
    {
        Status = ExecutionStatus.Running;
        ErrorMessage = null;
    }

    public void MarkSucceeded(JsonDocument state)
    {
        Status = ExecutionStatus.Succeeded;
        FinishedAt = DateTimeOffset.UtcNow;
        ExecutionState = state;
        CurrentBatchId = null;
    }

    public void MarkFailed(string error, JsonDocument? state = null)
    {
        Status = ExecutionStatus.Failed;
        FinishedAt = DateTimeOffset.UtcNow;
        const int maxSafe = 32768;
        const string suffix = "... [truncated]";
        ErrorMessage = error?.Length > maxSafe
            ? error[..(maxSafe - suffix.Length)] + suffix
            : error;
        if (state != null)
        {
            ExecutionState = state;
        }
    }

    public void TruncateErrorMessage(int maxLength = 1900)
    {
        const string suffix = "... [truncated]";
        if (ErrorMessage != null && ErrorMessage.Length > maxLength)
        {
            var take = Math.Max(0, maxLength - suffix.Length);
            ErrorMessage = ErrorMessage[..take] + suffix;
        }
    }

    public void MarkCancelled()
    {
        Status = ExecutionStatus.Cancelled;
        FinishedAt = DateTimeOffset.UtcNow;
    }

    public void Cancel() => MarkCancelled();
}
