using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Studio.Features.Studios;

public record GetStudiosQuery();

public class GetStudiosEndpoint(IMessageBus bus) : EndpointWithoutRequest<IReadOnlyList<StudioDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<StudiosGroup>();
        Permissions(P.Studio.GetAll);
        Description(x => x.WithName("GetStudios"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<StudioDto>>>(
            new GetStudiosQuery(),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetStudiosHandler(StudioDbContext db)
{
    public async Task<Result<IReadOnlyList<StudioDto>>> HandleAsync(
        GetStudiosQuery query,
        CancellationToken ct
    )
    {
        var studios = await db
            .Studios.AsNoTracking()
            .OrderBy(x => x.Name)
            .ProjectToType<StudioDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<StudioDto>>(studios);
    }
}
