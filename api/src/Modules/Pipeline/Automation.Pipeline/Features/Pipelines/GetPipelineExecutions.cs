using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record GetPipelineExecutionsQuery(Guid PipelineId);

public class GetPipelineExecutionsEndpoint(IMessageBus bus) : EndpointWithoutRequest<List<PipelineExecutionDto>>
{
    public override void Configure()
    {
        Get("{pipelineId:guid}/executions");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);

        Description(d => d
            .Produces<List<PipelineExecutionDto>>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("pipelineId");
        var result = await bus.InvokeAsync<Result<List<PipelineExecutionDto>>>(new GetPipelineExecutionsQuery(pipelineId), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPipelineExecutionsHandler(PipelineDbContext db)
{
    public async Task<Result<List<PipelineExecutionDto>>> HandleAsync(
        GetPipelineExecutionsQuery query,
        CancellationToken ct
    )
    {
        var executions = await db.PipelineExecutions
            .AsNoTracking()
            .Where(x => x.PipelineId == query.PipelineId)
            .OrderByDescending(x => x.StartedAt)
            .Take(50)
            .Select(x => new PipelineExecutionDto(
                x.Id,
                x.PipelineId,
                x.AgentId,
                x.Status,
                x.StartedAt,
                x.FinishedAt,
                x.ErrorMessage,
                x.NextNodeIndex,
                x.CurrentBatchId,
                x.ExecutionState
            ))
            .ToListAsync(ct);

        return Result.Ok(executions);
    }
}
