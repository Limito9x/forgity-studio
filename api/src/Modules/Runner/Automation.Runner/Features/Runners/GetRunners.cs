using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GetRunnersQuery(bool? IsActive);

public class GetRunnersEndpoint(IMessageBus bus) : EndpointWithoutRequest<IReadOnlyList<RunnerDto>>
{
    public override void Configure()
    {
        Get("");
        Group<RunnersGroup>();
        Permissions(P.Runner.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var isActive = Query<bool?>("isActive", isRequired: false);
        var result = await bus.InvokeAsync<Result<IReadOnlyList<RunnerDto>>>(new GetRunnersQuery(isActive), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRunnersHandler(RunnerDbContext db)
{
    public async Task<Result<IReadOnlyList<RunnerDto>>> HandleAsync(GetRunnersQuery query, CancellationToken ct)
    {
        IQueryable<Domain.Entities.Runner> dbQuery = db.Runners.AsNoTracking();

        if (query.IsActive.HasValue)
            dbQuery = dbQuery.Where(x => x.IsActive == query.IsActive.Value);

        var runners = await dbQuery
            .Include(x => x.ExecutorConfigs)
            .OrderByDescending(x => x.CreatedAt)
            .ProjectToType<RunnerDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<RunnerDto>>(runners);
    }
}
