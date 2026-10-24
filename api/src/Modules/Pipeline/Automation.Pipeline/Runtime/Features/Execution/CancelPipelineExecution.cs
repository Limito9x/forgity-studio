using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Runner.Contracts;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
namespace Automation.Pipeline.Runtime.Features.Execution;

public class CancelPipelineExecutionEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<PipelineExecutionDto>
{
    public override void Configure()
    {
        Post("executions/{id:guid}/cancel");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);

        Description(d => d
            .WithName("CancelPipelineExecution")
            .Produces<PipelineExecutionDto>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<PipelineExecutionDto>>(
            new CancelPipelineExecutionCommand(id),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

public record CancelPipelineExecutionCommand(Guid ExecutionId);

[Transactional(typeof(PipelineDbContext))]
public class CancelPipelineExecutionHandler(
    PipelineDbContext db,
    IRunnerApi runnerApi,
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

        // Terminate any active DCC subprocess tree (Blender / Unreal / Python) on connected Runners
        try
        {
            await runnerApi.BroadcastCancelExecutionCommandAsync(
                exec.Id.ToString(),
                exec.CurrentBatchId ?? string.Empty,
                ct
            );
        }
        catch
        {
            // Non-fatal if runner is unreachable
        }

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
