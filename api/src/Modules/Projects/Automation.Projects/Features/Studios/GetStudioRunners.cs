using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Projects.Infrastructure.Persistence;
using Automation.Projects.Shared.Dtos;

namespace Automation.Projects.Features.Studios;

public record GetStudioRunnersQuery(Guid StudioId);

public class GetStudioRunnersEndpoint(IMessageBus bus)
    : Endpoint<GetStudioRunnersQuery, IReadOnlyList<StudioRunnerDto>>
{
    public override void Configure()
    {
        Get("/{studioId:guid}/runners");
        Group<StudiosGroup>();
        Permissions(P.Studio.GetById);
        Description(x => x.WithName("GetStudioRunners"));
    }

    public override async Task HandleAsync(GetStudioRunnersQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<StudioRunnerDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetStudioRunnersHandler(ProjectsDbContext db)
{
    public async Task<Result<IReadOnlyList<StudioRunnerDto>>> HandleAsync(
        GetStudioRunnersQuery query,
        CancellationToken ct)
    {
        var runners = await db.StudioRunners
            .AsNoTracking()
            .Where(x => x.StudioId == query.StudioId)
            .OrderBy(x => x.CreatedAt)
            .ProjectToType<StudioRunnerDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<StudioRunnerDto>>(runners);
    }
}
