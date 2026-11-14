using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;
using Automation.DynamicForms.Contracts;
using Automation.Files.Contracts;

namespace Automation.Content.Features.ContentItems;

public record GetContentItemByIdQuery
{
    public Guid? Id { get; set; }
    public Guid? ProjectId { get; set; }
    public string? ContentTypeKey { get; set; }
    public string? KeyOrId { get; set; }
}

public class GetContentItemEndpoint(IMessageBus bus)
    : Endpoint<GetContentItemByIdQuery, ContentItemDto>
{
    public override void Configure()
    {
        Get(ContentRoutes.NestedContentItemDetail);
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.GetById);
        Description(x => x.WithName("GetContentItem"));
    }

    public override async Task HandleAsync(
        GetContentItemByIdQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentItemDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetContentItemByIdHandler(ContentDbContext db, ISchemaApi schemaApi, IAssetApi assetApi)
{
    public async Task<Result<ContentItemDto>> HandleAsync(
        GetContentItemByIdQuery query,
        CancellationToken ct)
    {
        Domain.Entities.ContentItem? item = null;

        if (query.Id.HasValue)
        {
            item = await db.ContentItems
                .Include(x => x.ContentType)
                .FirstOrDefaultAsync(x => x.Id == query.Id.Value, ct);
        }
        else if (!string.IsNullOrWhiteSpace(query.KeyOrId))
        {
            if (Guid.TryParse(query.KeyOrId, out var parsedGuid))
            {
                item = await db.ContentItems
                    .Include(x => x.ContentType)
                    .FirstOrDefaultAsync(x => x.Id == parsedGuid, ct);
            }
            else if (query.ProjectId.HasValue && !string.IsNullOrWhiteSpace(query.ContentTypeKey))
            {
                item = await db.ContentItems
                    .Include(x => x.ContentType)
                    .FirstOrDefaultAsync(x => x.ProjectId == query.ProjectId.Value && x.ContentType.Key == query.ContentTypeKey && x.Key == query.KeyOrId, ct);
            }
        }
        
        if (item is null) return Result.Fail(new NotFoundError("ContentItem not found"));
        
        var dataResult = await schemaApi.GetDataAsync(item.Id.ToString(), item.ContentType!.Key, ct);

        Guid? thumbnailAssetId = null;
        string? thumbnailUrl = null;

        var assetResult = await assetApi.GetFilesAsync(item.Id.ToString(), nameof(Domain.Entities.ContentItem), ContentAssetSlots.ContentThumbnail, ct);
        if (assetResult.IsSuccess && assetResult.Value.FirstOrDefault() is { } asset)
        {
            thumbnailAssetId = asset.AssetId;
            thumbnailUrl = asset.PublicUrl;
        }

        return Result.Ok(new ContentItemDto
        {
            Id = item.Id,
            ContentTypeId = item.ContentTypeId,
            ProjectId = item.ProjectId,
            Name = item.Name,
            Key = item.Key,
            ResolvedData = dataResult.IsSuccess ? dataResult.Value.ResolvedData : null,
            Values = dataResult.IsSuccess ? dataResult.Value.Values : null,
            ThumbnailAssetId = thumbnailAssetId,
            ThumbnailUrl = thumbnailUrl,
        });
    }
}
