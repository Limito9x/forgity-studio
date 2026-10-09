using System.Text.Json.Serialization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;
using Automation.DynamicForms.Contracts;
using Automation.Files.Contracts;
using Automation.SharedKernel.Extensions.Strings;

namespace Automation.Content.Features.ContentItems;

public record UpdateContentItemCommand
{
    public Guid? Id { get; set; }
    public Guid? ProjectId { get; set; }
    public string? ContentTypeKey { get; set; }
    public string? KeyOrId { get; set; }

    public string Name { get; set; } = null!;
    public string? Key { get; set; }
    public JsonDocument Values { get; set; } = null!;
    public Guid? ThumbnailAssetId { get; set; }
    public string? ThumbnailFileName { get; set; }
}

public class UpdateContentItemValidator : Validator<UpdateContentItemCommand>
{
    public UpdateContentItemValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Values).NotNull();
    }
}

public class UpdateContentItemEndpoint(IMessageBus bus)
    : Endpoint<UpdateContentItemCommand, ContentItemDto>
{
    public override void Configure()
    {
        Put(ContentRoutes.NestedContentItemDetail);
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.Update);
        Description(x => x.WithName("UpdateContentItem"));
    }

    public override async Task HandleAsync(
        UpdateContentItemCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentItemDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ContentDbContext))]
public class UpdateContentItemHandler(ContentDbContext db, ISchemaApi schemaApi, IAssetApi assetApi)
{
    public async Task<Result<ContentItemDto>> HandleAsync(
        UpdateContentItemCommand request,
        CancellationToken cancellationToken)
    {
        Domain.Entities.ContentItem? item = null;

        if (request.Id.HasValue && request.Id.Value != Guid.Empty)
        {
            item = await db.ContentItems
                .Include(x => x.ContentType)
                .FirstOrDefaultAsync(x => x.Id == request.Id.Value, cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(request.KeyOrId))
        {
            if (Guid.TryParse(request.KeyOrId, out var parsedGuid))
            {
                item = await db.ContentItems
                    .Include(x => x.ContentType)
                    .FirstOrDefaultAsync(x => x.Id == parsedGuid, cancellationToken);
            }
            else if (request.ProjectId.HasValue && !string.IsNullOrWhiteSpace(request.ContentTypeKey))
            {
                item = await db.ContentItems
                    .Include(x => x.ContentType)
                    .FirstOrDefaultAsync(x => x.ProjectId == request.ProjectId.Value && x.ContentType.Key == request.ContentTypeKey && x.Key == request.KeyOrId, cancellationToken);
            }
        }
            
        if (item is null) return Result.Fail(new NotFoundError("ContentItem not found"));

        var keyToSet = item.Key;
        if (!string.IsNullOrWhiteSpace(request.Key))
        {
            var normalizedKey = request.Key.ToSlug();
            if (normalizedKey != item.Key)
            {
                var keyExists = await db.ContentItems
                    .AnyAsync(c => c.ProjectId == item.ProjectId && c.ContentTypeId == item.ContentTypeId && c.Key == normalizedKey && c.Id != item.Id, cancellationToken);
                if (keyExists)
                {
                    return Result.Fail(new Error($"ContentItem with key '{normalizedKey}' already exists in this content type."));
                }
                keyToSet = normalizedKey;
            }
        }
        
        item.Update(request.Name, keyToSet);
        await db.SaveChangesAsync(cancellationToken);

        var dataResult = await schemaApi.SaveDataAsync(
            "ContentType", 
            item.ContentTypeId.ToString(), 
            item.Id.ToString(), 
            item.ContentType.Key, 
            request.Values, 
            cancellationToken);

        if (dataResult.IsFailed)
        {
            return dataResult.ToResult<ContentItemDto>();
        }

        
        if (request.ThumbnailAssetId != null)
        {
            await assetApi.VerifyAndLinkAsync(
                request.ThumbnailAssetId.Value,
                nameof(ContentItem),
                ContentAssetSlots.ContentThumbnail,
                item.Id.ToString(),
                request.ThumbnailFileName ?? "Thumbnail",
                0,
                cancellationToken
            );
        }
        else {
            await assetApi.RemoveLinkAsync(
                item.Id.ToString(),
                nameof(ContentItem),
                ContentAssetSlots.ContentThumbnail,
                cancellationToken
            );
        }
        
        return Result.Ok(new ContentItemDto
        {
            Id = item.Id,
            ContentTypeId = item.ContentTypeId,
            ProjectId = item.ProjectId,
            Name = item.Name,
            Key = item.Key,
            Values = dataResult.Value.Values
        });
    }
}
