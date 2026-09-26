using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;
using Automation.DynamicForms.Contracts;
using Automation.Files.Contracts;
using Automation.SharedKernel.Errors;
using Gridify;

namespace Automation.Content.Features.ContentItems;

public class GetContentItemsQuery : PagedQuery
{
    public Guid ProjectId { get; set; }

    public string Key { get; set; } = null!;
}

public class GetContentItemsEndpoint(IMessageBus bus)
    : Endpoint<GetContentItemsQuery, PagedResult<ContentItemDto>>
{
    public override void Configure()
    {
        Get(ContentRoutes.NestedContentItems);
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.GetAll);
        Description(x => x.WithName("GetContentItems"));
    }

    public override async Task HandleAsync(
        GetContentItemsQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PagedResult<ContentItemDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetContentItemsHandler(ContentDbContext db, ISchemaApi schemaApi, IAssetApi assetApi)
{
    public async Task<Result<PagedResult<ContentItemDto>>> HandleAsync(
        GetContentItemsQuery query,
        CancellationToken ct)
    {
        var mapper = new GridifyMapper<ContentItem>()
            .GenerateMappings();

        var queryable = db.ContentItems.AsQueryable();

        queryable = queryable.Where(x => x.ProjectId == query.ProjectId);

        if (!string.IsNullOrEmpty(query.Key))
        {
            if(Guid.TryParse(query.Key, out var contentTypeId))
            {
                queryable = queryable.Where(x => x.ContentTypeId == contentTypeId);
            }
            else
            {
                var contentType = await db.ContentTypes.FirstOrDefaultAsync(c => c.Key == query.Key, ct);
                if (contentType == null)
                {
                    return Result.Fail(new NotFoundError($"ContentType with key {query.Key} not found"));
                }
                queryable = queryable.Where(x => x.ContentTypeId == contentType.Id);
            }
        }

        var result = await queryable
            .ToPagedResultAsync<ContentItem, ContentItemDto>(query, mapper, ct);

        if (result.IsSuccess && result.Value.Items.Any())
        {
            var itemIds = result.Value.Items.Select(i => i.Id.ToString()).ToList();
            var dataResult = await schemaApi.GetMultipleDataAsync(itemIds, "ContentItem", ct);
            
            if (dataResult.IsSuccess)
            {
                var valuesMap = dataResult.Value.ToDictionary(d => d.ClientId, d => d.Values);
                foreach (var item in result.Value.Items)
                {
                    if (valuesMap.TryGetValue(item.Id.ToString(), out var values))
                    {
                        item.Values = values;
                    }
                }
            }

            // Fetch thumbnails in bulk
            foreach (var item in result.Value.Items)
            {
                var assetResult = await assetApi.GetFilesAsync(item.Id.ToString(), nameof(ContentItem), ContentAssetSlots.ContentThumbnail, ct);
                if (assetResult.IsSuccess && assetResult.Value.FirstOrDefault() is { } asset)
                {
                    item.ThumbnailAssetId = asset.AssetId;
                    item.ThumbnailUrl = asset.PublicUrl;
                }
            }
        }
            
        return result;
    }
}
