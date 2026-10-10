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

public record CreateContentItemCommand{
    public Guid ProjectId { get; set; }

    public string Key { get; set; } = null!;

    public string? ItemKey { get; set; }

    public string Name { get; set; } = null!;

    public JsonDocument Values { get; set; } = null!;
    public Guid? ThumbnailAssetId { get; set; }
    public string? ThumbnailFileName { get; set; }
};

public class CreateContentItemValidator : Validator<CreateContentItemCommand>
{
    public CreateContentItemValidator()
    {
        RuleFor(x => x.Key).NotEmpty();
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Values).NotNull();
    }
}

public class CreateContentItemEndpoint(IMessageBus bus)
    : Endpoint<CreateContentItemCommand, ContentItemDto>
{
    public override void Configure()
    {
        Post(ContentRoutes.NestedContentItems);
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.Create);
        Description(x => x.WithName("CreateContentItem"));
    }

    public override async Task HandleAsync(
        CreateContentItemCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentItemDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ContentDbContext))]
public class CreateContentItemHandler(ContentDbContext db, ISchemaApi schemaApi, IAssetApi assetApi)
{
    public async Task<Result<ContentItemDto>> HandleAsync(
        CreateContentItemCommand request,
        CancellationToken cancellationToken)
    {
        var contentType = await db.ContentTypes
            .FirstOrDefaultAsync(c => c.Key == request.Key && c.ProjectId == request.ProjectId, cancellationToken);

        if (contentType is null)
        {
            return Result.Fail("ContentType not found");
        }

        var itemKey = string.IsNullOrWhiteSpace(request.ItemKey)
            ? request.Name.ToSlug()
            : request.ItemKey.ToSlug();

        if (string.IsNullOrWhiteSpace(itemKey))
        {
            return Result.Fail(new Error("Content item key cannot be empty or invalid."));
        }

        var keyExists = await db.ContentItems
            .AnyAsync(c => c.ProjectId == request.ProjectId && c.ContentTypeId == contentType.Id && c.Key == itemKey, cancellationToken);
        if (keyExists)
        {
            return Result.Fail(new Error($"ContentItem with key '{itemKey}' already exists in this content type."));
        }

        var item = new ContentItem(
            contentType.Id,
            request.ProjectId,
            request.Name,
            itemKey
        );

        db.ContentItems.Add(item);
        await db.SaveChangesAsync(cancellationToken);

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
        
        var dataResult = await schemaApi.SaveDataAsync(
            "ContentType", 
            contentType.Id.ToString(), 
            item.Id.ToString(), 
            contentType.Key, 
            request.Values, 
            cancellationToken);

        if (dataResult.IsFailed)
        {
            return dataResult.ToResult<ContentItemDto>();
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
