using Automation.Pipeline.Domain.Enums;

namespace Automation.Pipeline.Runtime.State.Messages;

public record SubPipelineCompletedMessage(
    Guid ParentExecutionId,
    Guid ChildExecutionId,
    ExecutionStatus ChildStatus,
    string? ErrorMessage = null
);

