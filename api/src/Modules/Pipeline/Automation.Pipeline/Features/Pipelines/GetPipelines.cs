using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record GetPipelinesQuery(Guid? ProjectId);

public class GetPipelinesRequest
{
    public Guid? ProjectId { get; set; }
}

public class GetPipelinesEndpoint(IMessageBus bus) : Endpoint<GetPipelinesRequest, List<PipelineSummaryDto>>
{
    public override void Configure()
    {
        Get("");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetAll);
        Description(d => d
            .Produces<List<PipelineSummaryDto>>(200)
            .Produces(400));
    }

    public override async Task HandleAsync(GetPipelinesRequest req, CancellationToken ct)
    {
        var query = new GetPipelinesQuery(req.ProjectId);
        var result = await bus.InvokeAsync<Result<List<PipelineSummaryDto>>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPipelinesHandler(PipelineDbContext db)
{
    public async Task<Result<List<PipelineSummaryDto>>> HandleAsync(
        GetPipelinesQuery query,
        CancellationToken ct
    )
    {
        var q = db.Pipelines.AsNoTracking();

        if (query.ProjectId.HasValue && query.ProjectId.Value != Guid.Empty)
        {
            q = q.Where(x => x.ProjectId == query.ProjectId.Value);
        }

        var list = await q
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new PipelineSummaryDto(
                x.Id,
                x.ProjectId,
                x.Name,
                x.TriggerType,
                x.TriggerWorkspaceId,
                x.Nodes.Count,
                x.Edges.Count,
                x.CreatedAt,
                x.TriggerConfig
            ))
            .ToListAsync(ct);

        return Result.Ok(list);
    }
}
