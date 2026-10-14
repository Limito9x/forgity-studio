using Automation.Files.Contracts;
using Automation.Repository.Constants;
using Automation.Repository.Infrastructure.Persistence;
using FastEndpoints;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Repository.Features.ResourceVersions;

public record ResourceVersionDownloadDto(
    Guid ResourceVersionId,
    int VersionNo,
    string FileName,
    string DownloadUrl,
    long SizeBytes,
    string ContentType
);

public record GetResourceVersionDownloadUrlQuery(Guid ResourceVersionId);

public class GetResourceVersionDownloadUrlEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<ResourceVersionDownloadDto>
{
    public override void Configure()
    {
        Get("{id:guid}/download-url");
        Group<ResourceVersionsGroup>();
        Permissions(P.Resource.GetById);
        Description(x => x.WithName("GetResourceVersionDownloadUrl"));

    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<ResourceVersionDownloadDto>>(
            new GetResourceVersionDownloadUrlQuery(id),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetResourceVersionDownloadUrlHandler(
    RepositoryDbContext db,
    IAssetApi assetApi
)
{
    public async Task<Result<ResourceVersionDownloadDto>> HandleAsync(
        GetResourceVersionDownloadUrlQuery query,
        CancellationToken ct
    )
    {
        var version = await db.ResourceVersions
            .AsNoTracking()
            .Include(v => v.Resource)
            .FirstOrDefaultAsync(v => v.Id == query.ResourceVersionId, ct);

        if (version is null)
        {
            return Result.Fail<ResourceVersionDownloadDto>($"ResourceVersion '{query.ResourceVersionId}' was not found.");
        }

        if (!version.IsCloudSynced || !version.AssetLinkId.HasValue)
        {
            return Result.Fail<ResourceVersionDownloadDto>("This resource version has not been synchronized to cloud storage yet.");
        }

        var filesResult = await assetApi.GetFilesAsync(
            ownerEntityId: version.Id.ToString(),
            ownerEntityType: "ResourceVersion",
            slotKey: ResourceAssetSlots.ResourceVersion,
            ct
        );

        if (filesResult.IsFailed || filesResult.Value.Count == 0)
        {
            return Result.Fail<ResourceVersionDownloadDto>("Asset file link was not found in storage.");
        }

        var assetLink = filesResult.Value[0];
        var fileName = !string.IsNullOrWhiteSpace(assetLink.OriginalName)
            ? assetLink.OriginalName
            : Path.GetFileName(version.Resource.RelativePath);

        return Result.Ok(new ResourceVersionDownloadDto(
            version.Id,
            version.VersionNo,
            fileName,
            assetLink.PublicUrl,
            assetLink.SizeBytes,
            assetLink.ContentType
        ));
    }
}

