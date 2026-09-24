using Automation.Workspace.Constants;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using FastEndpoints;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Resources;

// 1. Query
public record GetResourcesByContentQuery(Guid ContentId);

// 2. Endpoint
public class GetResourcesByContentEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<List<ContentResourceDto>>
{
    public override void Configure()
    {
        Get(WorkspaceRoutes.ContentResources);
        Group<ResourcesGroup>();
        Permissions(P.Resource.GetAll);
        Description(x => x.WithName("GetResourcesByContent"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var contentId = Route<Guid>("contentId");
        var result = await bus.InvokeAsync<Result<List<ContentResourceDto>>>(
            new GetResourcesByContentQuery(contentId),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[NonTransactional]
public class GetResourcesByContentHandler(WorkspaceDbContext db)
{
    public async Task<Result<List<ContentResourceDto>>> HandleAsync(
        GetResourcesByContentQuery query,
        CancellationToken ct
    )
    {
        var resources = await db.ResourceItems
            .AsNoTracking()
            .Include(r => r.Repository)
            .Include(r => r.Versions)
            .Where(r => r.ContentId == query.ContentId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(ct);

        var dtos = resources.Select(r =>
        {
            var latest = r.LatestVersion;
            return new ContentResourceDto(
                Id: r.Id,
                WorkspaceId: r.RepositoryId,
                WorkspaceName: r.Repository?.Name ?? string.Empty,
                DisplayName: r.DisplayName,
                RelativePath: r.RelativePath,
                PlatformExtensionId: r.PlatformExtensionId,
                LatestVersionNo: latest?.VersionNo ?? 0,
                LatestSizeBytes: latest?.SizeBytes ?? 0,
                VersionCount: r.Versions.Count,
                CreatedAt: r.CreatedAt
            );
        }).ToList();

        return Result.Ok(dtos);
    }
}
