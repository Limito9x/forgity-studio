using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Runtime.Planner.Models;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
namespace Automation.Pipeline.Runtime.Features.Execution;

public class GetPipelineExecutionEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<PipelineExecutionDto>
{
    public override void Configure()
    {
        Get("executions/{id:guid}");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);

        Description(d => d.Produces<PipelineExecutionDto>(200).Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<PipelineExecutionDto>>(
            new GetPipelineExecutionQuery(id),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

public record GetPipelineExecutionQuery(Guid Id);

[NonTransactional]
public class GetPipelineExecutionHandler(
    PipelineDbContext db,
    IExecutionStateStore stateStore
)
{
    public async Task<Result<PipelineExecutionDto>> HandleAsync(
        GetPipelineExecutionQuery query,
        CancellationToken ct
    )
    {
        var exec = await db
            .PipelineExecutions.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (exec != null)
        {
            var dto = new PipelineExecutionDto(
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
            return Result.Ok(dto);
        }

        // Ephemeral Draft Execution Fallback (Zero-DB)
        var draftState = await stateStore.GetFullStateAsync(query.Id, ct);
        if (draftState != null && draftState.IsDraft)
        {
            var draftDto = new PipelineExecutionDto(
                draftState.ExecutionId != Guid.Empty ? draftState.ExecutionId : query.Id,
                draftState.PipelineId,
                draftState.Status,
                draftState.StartedAt,
                draftState.FinishedAt,
                draftState.ErrorMessage,
                draftState.NextNodeIndex,
                draftState.CurrentBatchId,
                null
            );
            return Result.Ok(draftDto);
        }

        return Result.Fail<PipelineExecutionDto>($"Pipeline execution '{query.Id}' not found.");
    }
}
