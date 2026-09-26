using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class GetNodeExecutionsEndpoint(IMessageBus bus) : EndpointWithoutRequest<List<NodeExecutionDto>>
{
    public override void Configure()
    {
        Get("executions/{id:guid}/node-executions");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);

        Description(d => d
            .Produces<List<NodeExecutionDto>>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<List<NodeExecutionDto>>>(new GetNodeExecutionsQuery(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

public record GetNodeExecutionsQuery(Guid ExecutionId);

[NonTransactional]
public class GetNodeExecutionsHandler(PipelineDbContext db)
{
    public async Task<Result<List<NodeExecutionDto>>> HandleAsync(
        GetNodeExecutionsQuery query,
        CancellationToken ct
    )
    {
        var nodeExecs = await db.NodeExecutions
            .AsNoTracking()
            .Where(x => x.PipelineExecutionId == query.ExecutionId)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);

        var dtos = nodeExecs.Select(x => new NodeExecutionDto(
            x.Id,
            x.PipelineExecutionId,
            x.PipelineNodeId,
            x.Status,
            x.StartedAt,
            x.FinishedAt,
            x.ErrorMessage,
            x.Output,
            x.Log
        )).ToList();

        return Result.Ok(dtos);
    }
}
