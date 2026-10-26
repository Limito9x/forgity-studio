using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Runtime.State.Messages;
using Microsoft.Extensions.Logging;
using Wolverine;

namespace Automation.Pipeline.Runtime.Orchestrator.SubPipeline;

public interface ISubPipelineCompletionNotifier
{
    Task NotifyIfChildAsync(PipelineExecution execution, CancellationToken ct = default);
}

public class SubPipelineCompletionNotifier(
    IMessageBus bus,
    ILogger<SubPipelineCompletionNotifier> logger
) : ISubPipelineCompletionNotifier
{
    public async Task NotifyIfChildAsync(PipelineExecution execution, CancellationToken ct = default)
    {
        if (!execution.ParentExecutionId.HasValue)
        {
            return;
        }

        if (execution.Status is not (ExecutionStatus.Succeeded or ExecutionStatus.Failed or ExecutionStatus.Cancelled))
        {
            return;
        }

        var parentId = execution.ParentExecutionId.Value;
        logger.LogInformation(
            "Child Execution [{ChildId}] reached terminal status [{Status}]. Publishing SubPipelineCompletedMessage to parent [{ParentId}].",
            execution.Id,
            execution.Status,
            parentId
        );

        var message = new SubPipelineCompletedMessage(
            ParentExecutionId: parentId,
            ChildExecutionId: execution.Id,
            ChildStatus: execution.Status,
            ErrorMessage: execution.ErrorMessage
        );

        await bus.PublishAsync(message);
    }
}

