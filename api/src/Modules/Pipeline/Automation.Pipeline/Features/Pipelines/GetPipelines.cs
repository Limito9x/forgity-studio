using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record GetPipelinesQuery(Guid? ProjectId, bool IsArchived = false);

public class GetPipelinesRequest
{
    public Guid? ProjectId { get; set; }
    public bool IsArchived { get; set; } = false;
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
        var query = new GetPipelinesQuery(req.ProjectId, req.IsArchived);
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

        if (query.IsArchived)
        {
            // Bỏ qua Global Query Filter để lấy danh sách trong Thùng rác (Trash)
            q = q.IgnoreQueryFilters().Where(x => x.DeletedAt != null);
        }

        if (query.ProjectId.HasValue && query.ProjectId.Value != Guid.Empty)
        {
            q = q.Where(x => x.ProjectId == query.ProjectId.Value);
        }

        var list = await q
            .OrderByDescending(x => query.IsArchived ? x.DeletedAt : x.CreatedAt)
            .Select(x => new PipelineSummaryDto(
                x.Id,
                x.ProjectId,
                x.Name,
                x.TriggerType,
                x.Nodes.Count,
                x.Edges.Count,
                x.CreatedAt,
                x.TriggerConfig,
                x.DeletedAt
            ))
            .ToListAsync(ct);

        return Result.Ok(list);
    }
}
