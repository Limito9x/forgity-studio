using Automation.Content.Contracts;
using Automation.Repository.Constants;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using FastEndpoints;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Resources;

// 1. Query
public record GetResourcesByContentQuery(Guid ContentId);

// 2. Endpoint
public class GetResourcesByContentEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<List<ContentResourceDto>>
{
    public override void Configure()
    {
        Get("by-content/{contentId:guid}");
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
public class GetResourcesByContentHandler(RepositoryDbContext db, IContentApi contentApi)
{
    public async Task<Result<List<ContentResourceDto>>> HandleAsync(
        GetResourcesByContentQuery query,
        CancellationToken ct
    )
    {
        var linkedResult = await contentApi.GetLinkedResourceIdsByContentIdAsync(query.ContentId, ct);
        if (linkedResult.IsFailed)
        {
            return Result.Fail<List<ContentResourceDto>>(linkedResult.Errors);
        }

        var linkedIds = linkedResult.Value;
        if (linkedIds.Count == 0)
        {
            return Result.Ok(new List<ContentResourceDto>());
        }

        var resources = await db.ResourceItems
            .AsNoTracking()
            .Include(r => r.Repository)
            .Include(r => r.Versions)
            .Where(r => linkedIds.Contains(r.Id))
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(ct);

        var anchorLinksResult = await contentApi.GetResourceAnchorLinksAsync(linkedIds, ct);
        var anchorMap = anchorLinksResult.IsSuccess
            ? anchorLinksResult.Value
            : new Dictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>();

        var dtos = resources.Select(r =>
        {
            var latest = r.LatestVersion;
            var anchorPath = anchorMap.TryGetValue(r.Id, out var links)
                ? links.FirstOrDefault()?.AnchorPath
                : null;

            return new ContentResourceDto(
                Id: r.Id,
                WorkspaceId: r.RepositoryId,
                WorkspaceName: r.Repository?.Name ?? string.Empty,
                DisplayName: r.DisplayName,
                RelativePath: r.RelativePath,
                Extension: r.Extension,
                LatestVersionNo: latest?.VersionNo ?? 0,
                LatestSizeBytes: latest?.SizeBytes ?? 0,
                VersionCount: r.Versions.Count,
                CreatedAt: r.CreatedAt,
                AnchorPath: anchorPath
            );
        }).ToList();

        return Result.Ok(dtos);
    }
}
