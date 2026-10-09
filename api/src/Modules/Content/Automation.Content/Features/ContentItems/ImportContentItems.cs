using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.DynamicForms.Contracts;
using Automation.SharedKernel.Extensions.Strings;

namespace Automation.Content.Features.ContentItems;

public enum ContentItemConflictStrategy
{
    Skip = 0,
    Update = 1,
    CreateNew = 2
}

public record ContentItemImportItemDto(
    string Name,
    string? Key,
    JsonDocument? Values
);

public record ContentItemImportError(string Key, string Reason);

public record ImportContentItemsResult(
    int TotalProcessed,
    int CreatedCount,
    int UpdatedCount,
    int SkippedCount,
    List<ContentItemImportError> Errors
);

public record ImportContentItemsCommand(
    Guid ProjectId,
    string ContentTypeKey,
    ContentItemConflictStrategy ConflictStrategy = ContentItemConflictStrategy.Skip,
    List<ContentItemImportItemDto>? Items = null
);

public class ImportContentItemsValidator : Validator<ImportContentItemsCommand>
{
    public ImportContentItemsValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.ContentTypeKey).NotEmpty();
        RuleFor(x => x.Items)
            .NotNull()
            .Must(x => x != null && x.Count > 0)
            .WithMessage("Items list must not be empty.");
    }
}

public class ImportContentItemsEndpoint(IMessageBus bus)
    : Endpoint<ImportContentItemsCommand, ImportContentItemsResult>
{
    public override void Configure()
    {
        Post(ContentRoutes.NestedContentItems + "/import");
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.Create);
        Description(x => x.WithName("ImportContentItems"));
    }

    public override async Task HandleAsync(ImportContentItemsCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ImportContentItemsResult>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ContentDbContext))]
public class ImportContentItemsHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result<ImportContentItemsResult>> HandleAsync(
        ImportContentItemsCommand request,
        CancellationToken cancellationToken)
    {
        var contentType = await db.ContentTypes
            .FirstOrDefaultAsync(c => c.ProjectId == request.ProjectId && c.Key == request.ContentTypeKey, cancellationToken);

        if (contentType is null)
        {
            return Result.Fail(new NotFoundError($"ContentType with key '{request.ContentTypeKey}' not found"));
        }

        var items = request.Items ?? new List<ContentItemImportItemDto>();
        int createdCount = 0;
        int updatedCount = 0;
        int skippedCount = 0;
        var errors = new List<ContentItemImportError>();

        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.Name))
            {
                errors.Add(new ContentItemImportError(item.Key ?? "Unknown", "Item name is required and cannot be empty."));
                continue;
            }

            var key = string.IsNullOrWhiteSpace(item.Key)
                ? item.Name.ToSlug()
                : item.Key.ToSlug();

            if (string.IsNullOrWhiteSpace(key))
            {
                errors.Add(new ContentItemImportError(item.Name, "Cannot generate valid key from item name."));
                continue;
            }

            var existing = await db.ContentItems
                .FirstOrDefaultAsync(x => x.ProjectId == request.ProjectId && x.ContentTypeId == contentType.Id && x.Key == key, cancellationToken);

            if (existing != null)
            {
                if (request.ConflictStrategy == ContentItemConflictStrategy.Skip)
                {
                    skippedCount++;
                    continue;
                }

                if (request.ConflictStrategy == ContentItemConflictStrategy.Update)
                {
                    existing.Update(item.Name, key);
                    await db.SaveChangesAsync(cancellationToken);

                    if (item.Values != null)
                    {
                        var dataResult = await schemaApi.SaveDataAsync(
                            "ContentType",
                            contentType.Id.ToString(),
                            existing.Id.ToString(),
                            contentType.Key,
                            item.Values,
                            cancellationToken
                        );

                        if (dataResult.IsFailed)
                        {
                            errors.Add(new ContentItemImportError(key, $"Failed to update dynamic form data: {dataResult.Errors.FirstOrDefault()?.Message}"));
                        }
                    }

                    updatedCount++;
                    continue;
                }

                if (request.ConflictStrategy == ContentItemConflictStrategy.CreateNew)
                {
                    key = $"{key}-{Guid.NewGuid().ToString("N")[..6]}";
                }
            }

            // Create new
            var newItem = new ContentItem(contentType.Id, request.ProjectId, item.Name, key);
            db.ContentItems.Add(newItem);
            await db.SaveChangesAsync(cancellationToken);

            if (item.Values != null)
            {
                var dataResult = await schemaApi.SaveDataAsync(
                    "ContentType",
                    contentType.Id.ToString(),
                    newItem.Id.ToString(),
                    contentType.Key,
                    item.Values,
                    cancellationToken
                );

                if (dataResult.IsFailed)
                {
                    errors.Add(new ContentItemImportError(key, $"Failed to save dynamic form data: {dataResult.Errors.FirstOrDefault()?.Message}"));
                }
            }

            createdCount++;
        }

        return Result.Ok(new ImportContentItemsResult(
            items.Count,
            createdCount,
            updatedCount,
            skippedCount,
            errors
        ));
    }
}
