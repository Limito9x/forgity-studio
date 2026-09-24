using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Platform.Infrastructure.Persistence;
using Automation.Platform.Shared.Dtos;

namespace Automation.Platform.Features.PlatformExtensions;

public record GetExtensionsQuery;

public class GetExtensionsEndpoint(IMessageBus bus) : EndpointWithoutRequest<IReadOnlyList<PlatformExtensionDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<PlatformExtensionsGroup>();
        Permissions(P.PlatformExtension.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<PlatformExtensionDto>>>(new GetExtensionsQuery(), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetExtensionsHandler(PlatformDbContext db)
{
    public async Task<Result<IReadOnlyList<PlatformExtensionDto>>> HandleAsync(GetExtensionsQuery query, CancellationToken ct)
    {
        var extensions = await db.PlatformExtensions
            .AsNoTracking()
            .OrderBy(x => x.Extension)
            .ProjectToType<PlatformExtensionDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<PlatformExtensionDto>>(extensions);
    }
}
