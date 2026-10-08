using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Automation.SharedKernel.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GetRunnersRequest
{
    [QueryParam]
    public bool? IsActive { get; init; }

    [QueryParam]
    public Guid? StudioId { get; init; }
}

public record GetRunnersQuery(bool? IsActive, Guid? StudioId);

public class GetRunnersEndpoint(IMessageBus bus, ICurrentStudioProvider currentStudioProvider) : Endpoint<GetRunnersRequest, IReadOnlyList<RunnerDto>>
{
    public override void Configure()
    {
        Get("");
        Group<RunnersGroup>();
        Permissions(P.Runner.GetAll);
    }

    public override async Task HandleAsync(GetRunnersRequest req, CancellationToken ct)
    {
        var studioId = req.StudioId ?? currentStudioProvider.StudioId;
        var result = await bus.InvokeAsync<Result<IReadOnlyList<RunnerDto>>>(new GetRunnersQuery(req.IsActive, studioId), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRunnersHandler(RunnerDbContext db)
{
    public async Task<Result<IReadOnlyList<RunnerDto>>> HandleAsync(GetRunnersQuery query, CancellationToken ct)
    {
        if (!query.StudioId.HasValue)
        {
            return Result.Ok<IReadOnlyList<RunnerDto>>([]);
        }

        IQueryable<Domain.Entities.Runner> dbQuery = db.Runners
            .AsNoTracking()
            .Where(x => x.Studios.Any(s => s.StudioId == query.StudioId.Value));

        if (query.IsActive.HasValue)
            dbQuery = dbQuery.Where(x => x.IsActive == query.IsActive.Value);

        var entities = await dbQuery
            .Include(x => x.ExecutorConfigs)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(ct);

        var runners = entities.Adapt<IReadOnlyList<RunnerDto>>();
        return Result.Ok(runners);
    }
}
