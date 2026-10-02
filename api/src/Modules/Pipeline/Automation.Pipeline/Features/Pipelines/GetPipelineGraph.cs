using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Features.Pipelines.Services;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record GetPipelineGraphQuery(Guid PipelineId);

public class GetPipelineGraphEndpoint(IMessageBus bus) : EndpointWithoutRequest<PipelineGraphDto>
{
    public override void Configure()
    {
        Get("{id:guid}/graph");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);
        Description(d => d
            .Produces<PipelineGraphDto>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var query = new GetPipelineGraphQuery(pipelineId);
        var result = await bus.InvokeAsync<Result<PipelineGraphDto>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPipelineGraphHandler(
    PipelineDbContext db,
    IPipelineGraphDtoBuilder graphDtoBuilder
)
{
    public async Task<Result<PipelineGraphDto>> HandleAsync(
        GetPipelineGraphQuery query,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .AsNoTracking()
            .Include(x => x.Nodes)
            .Include(x => x.Edges)
            .FirstOrDefaultAsync(x => x.Id == query.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineGraphDto>($"Pipeline '{query.PipelineId}' not found.");
        }

        var graphDto = await graphDtoBuilder.BuildDtoAsync(pipeline, ct);
        return Result.Ok(graphDto);
    }
}
