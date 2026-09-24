using Automation.Workspace.Constants;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using FastEndpoints;
using FluentResults;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.ResourceVersions;

// 1. Query
public record GetResourceVersionsQuery(Guid ResourceId);

// 2. Endpoint
public class GetResourceVersionsEndpoint(IMessageBus bus) : EndpointWithoutRequest<IReadOnlyList<ResourceVersionDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<ResourceVersionsGroup>();
        Permissions(P.Resource.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var resourceId = Query<Guid>("resourceId");
        var result = await bus.InvokeAsync<Result<IReadOnlyList<ResourceVersionDto>>>(new GetResourceVersionsQuery(resourceId), ct);
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[NonTransactional]
public class GetResourceVersionsHandler(WorkspaceDbContext db)
{
    public async Task<Result<IReadOnlyList<ResourceVersionDto>>> HandleAsync(GetResourceVersionsQuery query, CancellationToken ct)
    {
        var versions = await db.ResourceVersions
            .AsNoTracking()
            .Where(x => x.ResourceId == query.ResourceId)
            .OrderByDescending(x => x.VersionNo)
            .ProjectToType<ResourceVersionDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<ResourceVersionDto>>(versions);
    }
}
