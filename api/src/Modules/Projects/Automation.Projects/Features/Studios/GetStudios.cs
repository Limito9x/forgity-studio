using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Projects.Infrastructure.Persistence;
using Automation.Projects.Shared.Dtos;

namespace Automation.Projects.Features.Studios;

public record GetStudiosQuery();

public class GetStudiosEndpoint(IMessageBus bus)
    : Endpoint<GetStudiosQuery, IReadOnlyList<StudioDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<StudiosGroup>();
        Permissions(P.Studio.GetAll);
        Description(x => x.WithName("GetStudios"));
    }

    public override async Task HandleAsync(GetStudiosQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<StudioDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetStudiosHandler(ProjectsDbContext db)
{
    public async Task<Result<IReadOnlyList<StudioDto>>> HandleAsync(
        GetStudiosQuery query,
        CancellationToken ct)
    {
        var studios = await db.Studios
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .ProjectToType<StudioDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<StudioDto>>(studios);
    }
}
