using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines;

public record CancelPipelineExecutionRequest(Guid Id);

public class CancelPipelineExecutionEndpoint(IMessageBus bus)
    : Endpoint<CancelPipelineExecutionRequest, PipelineExecutionDto>
{
    public override void Configure()
    {
        Post("executions/{id:guid}/cancel");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);

        Description(d => d
            .Produces<PipelineExecutionDto>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancelPipelineExecutionRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PipelineExecutionDto>>(
            new CancelPipelineExecutionCommand(req.Id),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

public record CancelPipelineExecutionCommand(Guid ExecutionId);

[Transactional(typeof(PipelineDbContext))]
public class CancelPipelineExecutionHandler(
    PipelineDbContext db,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task<Result<PipelineExecutionDto>> HandleAsync(
        CancelPipelineExecutionCommand command,
        CancellationToken ct
    )
    {
        var exec = await db.PipelineExecutions
            .FirstOrDefaultAsync(x => x.Id == command.ExecutionId, ct);

        if (exec == null)
        {
            return Result.Fail<PipelineExecutionDto>($"Pipeline execution '{command.ExecutionId}' not found.");
        }

        // If already in a terminal state, return current status idempotently
        if (exec.Status is ExecutionStatus.Succeeded or ExecutionStatus.Failed or ExecutionStatus.Cancelled)
        {
            return Result.Ok(ToDto(exec));
        }

        exec.Cancel();
        await db.SaveChangesAsync(ct);

        if (hubContext != null)
        {
            try
            {
                await hubContext.Clients.Group($"pipeline_{exec.PipelineId}").SendAsync(
                    "PipelineExecutionFinished",
                    new
                    {
                        executionId = exec.Id,
                        pipelineId = exec.PipelineId,
                        status = (int)exec.Status,
                        finishedAt = exec.FinishedAt,
                        errorMessage = "Execution was cancelled by user.",
                        executionState = exec.ExecutionState
                    },
                    ct
                );
            }
            catch
            {
                // Non-fatal SignalR broadcast error
            }
        }

        return Result.Ok(ToDto(exec));
    }

    private static PipelineExecutionDto ToDto(Domain.Entities.PipelineExecution exec) =>
        new(
            exec.Id,
            exec.PipelineId,
            exec.Status,
            exec.StartedAt,
            exec.FinishedAt,
            exec.ErrorMessage,
            exec.NextNodeIndex,
            exec.CurrentBatchId,
            exec.ExecutionState
        );
}
