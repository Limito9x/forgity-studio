using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GetStudioRunnersQuery(Guid StudioId);

public class GetStudioRunnersEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<IReadOnlyList<RunnerStudioDto>>
{
    public override void Configure()
    {
        Get("by-studio/{studioId:guid}");
        Group<RunnersGroup>();
        Permissions(P.Runner.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var studioId = Route<Guid>("studioId");
        var result = await bus.InvokeAsync<Result<IReadOnlyList<RunnerStudioDto>>>(new GetStudioRunnersQuery(studioId), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetStudioRunnersHandler(RunnerDbContext db)
{
    public async Task<Result<IReadOnlyList<RunnerStudioDto>>> HandleAsync(GetStudioRunnersQuery query, CancellationToken ct)
    {
        var links = await db.RunnerStudios
            .AsNoTracking()
            .Include(rs => rs.Runner)
                .ThenInclude(r => r.ExecutorConfigs)
            .Where(rs => rs.StudioId == query.StudioId)
            .OrderByDescending(rs => rs.CreatedAt)
            .ProjectToType<RunnerStudioDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<RunnerStudioDto>>(links);
    }
}
