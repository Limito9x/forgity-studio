using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class GetPipelineExecutionEndpoint(IMessageBus bus) : EndpointWithoutRequest<PipelineExecutionDto>
{
    public override void Configure()
    {
        Get("executions/{id:guid}");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);

        Description(d => d
            .Produces<PipelineExecutionDto>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<PipelineExecutionDto>>(new GetPipelineExecutionQuery(id), ct);
        await this.SendResultAsync(result, ct);
    }

}

public record GetPipelineExecutionQuery(Guid Id);

[NonTransactional]
public class GetPipelineExecutionHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineExecutionDto>> HandleAsync(
        GetPipelineExecutionQuery query,
        CancellationToken ct
    )
    {
        var exec = await db.PipelineExecutions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (exec == null)
        {
            return Result.Fail<PipelineExecutionDto>($"Pipeline execution '{query.Id}' not found.");
        }

        var dto = new PipelineExecutionDto(
            exec.Id,
            exec.PipelineId,
            exec.AgentId,
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
}
