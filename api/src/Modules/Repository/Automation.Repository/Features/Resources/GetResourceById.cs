using Automation.Tag.Contracts;
using Automation.Tag.Contracts.Dtos;
using Automation.Repository.Constants;
using Automation.Repository.Contracts.Extensions;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using FastEndpoints;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Resources;

// 1. Query
public record GetResourceByIdQuery(Guid Id);

// 2. Endpoint
public class GetResourceByIdEndpoint(IMessageBus bus) : EndpointWithoutRequest<ResourceItemDto>
{
    public override void Configure()
    {
        Get("/{id:guid}");
        Group<ResourcesGroup>();
        Permissions(P.Resource.GetById);
        Description(x => x.WithName("GetResourceById"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<ResourceItemDto>>(new GetResourceByIdQuery(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[NonTransactional]
public class GetResourceByIdHandler(RepositoryDbContext db, ITagApi tagApi)
{
    public async Task<Result<ResourceItemDto>> HandleAsync(GetResourceByIdQuery query, CancellationToken ct)
    {
        var resource = await db.ResourceItems
            .AsNoTracking()
            .Where(x => x.Id == query.Id)
            .Include(x => x.Repository)
            .Include(x => x.Versions)
            .FirstOrDefaultAsync(ct);

        if (resource is null)
            return Result.Fail($"Resource with ID '{query.Id}' was not found.");

        // 1. Query Resource-level tags (the primary source of truth for semantic sub-path tags)
        var resourceTagResult = await tagApi.GetTagsByEntityAsync("Resource", resource.Id, ct);
        var resourceLinks = resourceTagResult.IsSuccess && resourceTagResult.Value != null ? resourceTagResult.Value : [];

        // 2. Query legacy ResourceVersion tags for backward compatibility
        var versionIds = resource.Versions.Select(v => v.Id).ToList();
        var tagsByVersion = new Dictionary<Guid, IReadOnlyList<TagLinkDetailDto>>();

        if (versionIds.Count > 0)
        {
            var tagResult = await tagApi.GetTagsByEntitiesAsync("ResourceVersion", versionIds, ct);
            if (tagResult.IsSuccess && tagResult.Value != null)
            {
                tagsByVersion = tagResult.Value.ToDictionary(k => k.Key, v => v.Value);
            }
        }

        var versionDtos = resource.Versions
            .OrderByDescending(v => v.VersionNo)
            .Select(v =>
            {
                var versionLinks = tagsByVersion.GetValueOrDefault(v.Id) ?? [];
                var combinedLinks = resourceLinks
                    .Where(t => !string.IsNullOrEmpty(t.TargetSubPath))
                    .Concat(versionLinks)
                    .ToList();

                var tagsByPath = combinedLinks
                    .GroupBy(t => !string.IsNullOrEmpty(t.TargetSubPath) ? t.TargetSubPath : TagMigrationHelper.ExtractPath(t.MetadataJson))
                    .Where(g => !string.IsNullOrEmpty(g.Key))
                    .ToDictionary(g => g.Key, g => (IReadOnlyList<TagLinkDetailDto>)g.ToList());

                return new ResourceVersionDto(
                    v.Id,
                    v.VersionNo,
                    v.SizeBytes,
                    v.FileHash,
                    v.Notes,
                    v.CreatedAt,
                    v.Metadata,
                    tagsByPath
                );
            })
            .ToList();

        var dto = new ResourceItemDto(
            resource.Id,
            resource.Repository?.ProjectId ?? Guid.Empty,
            resource.RepositoryId,
            resource.DisplayName,
            resource.RelativePath,
            resource.PlatformExtensionId,
            resource.ContentId,
            resource.CreatedAt,
            versionDtos
        );

        return Result.Ok(dto);
    }
}
