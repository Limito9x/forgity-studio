using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.DynamicForms.Contracts;

namespace Automation.Content.Features.ContentTypes;

public enum ContentTypeConflictStrategy
{
    Skip = 0,
    Update = 1
}

public record ImportContentTypesCommand(
    Guid ProjectId,
    ContentTypeConflictStrategy ConflictStrategy = ContentTypeConflictStrategy.Skip,
    List<ContentTypeExportItemDto>? ContentTypes = null
);

public record ContentTypeImportError(string Key, string Reason);

public record ImportContentTypesResult(
    int TotalProcessed,
    int CreatedCount,
    int UpdatedCount,
    int SkippedCount,
    List<ContentTypeImportError> Errors
);

public class ImportContentTypesValidator : Validator<ImportContentTypesCommand>
{
    public ImportContentTypesValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.ContentTypes)
            .NotNull()
            .Must(x => x != null && x.Count > 0)
            .WithMessage("ContentTypes list must not be empty.");
    }
}

public class ImportContentTypesEndpoint(IMessageBus bus)
    : Endpoint<ImportContentTypesCommand, ImportContentTypesResult>
{
    public override void Configure()
    {
        Post(ContentRoutes.NestedContentTypes + "/import");
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.Create);
        Description(x => x.WithName("ImportContentTypes"));
    }

    public override async Task HandleAsync(ImportContentTypesCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ImportContentTypesResult>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ContentDbContext))]
public class ImportContentTypesHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    private static readonly JsonDocument DefaultEmptyObject = JsonDocument.Parse("{}");
    private static readonly JsonDocument DefaultEmptyArray = JsonDocument.Parse("[]");

    public async Task<Result<ImportContentTypesResult>> HandleAsync(
        ImportContentTypesCommand command,
        CancellationToken ct)
    {
        var items = command.ContentTypes ?? [];
        var errors = new List<ContentTypeImportError>();

        int createdCount = 0;
        int updatedCount = 0;
        int skippedCount = 0;

        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.Key))
            {
                errors.Add(new ContentTypeImportError(item.Key ?? "Unknown", "ContentType Key cannot be empty."));
                continue;
            }

            var cleanKey = item.Key.Trim().ToLowerInvariant();
            var name = string.IsNullOrWhiteSpace(item.Name) ? cleanKey : item.Name.Trim();
            var displayName = string.IsNullOrWhiteSpace(item.DisplayName) ? name : item.DisplayName.Trim();
            var displayConfig = item.DisplayConfig ?? DefaultEmptyObject;

            try
            {
                var existing = await db.ContentTypes
                    .FirstOrDefaultAsync(c => c.ProjectId == command.ProjectId && c.Key == cleanKey, ct);

                if (existing != null)
                {
                    if (command.ConflictStrategy == ContentTypeConflictStrategy.Skip)
                    {
                        skippedCount++;
                        continue;
                    }

                    // Update existing content type
                    existing.Update(
                        name,
                        displayName,
                        item.Description,
                        item.Icon,
                        item.Color,
                        item.SortOrder,
                        displayConfig
                    );

                    if (item.FieldsConfig != null)
                    {
                        var schemaResult = await schemaApi.UpsertSchemaAsync(
                            "ContentType",
                            existing.Id.ToString(),
                            existing.Name,
                            item.FieldsConfig,
                            ct
                        );

                        if (schemaResult.IsFailed)
                        {
                            errors.Add(new ContentTypeImportError(cleanKey, $"Failed to update schema: {schemaResult.Errors.FirstOrDefault()?.Message}"));
                        }
                    }

                    updatedCount++;
                }
                else
                {
                    // Create new content type
                    var newType = new ContentType(
                        command.ProjectId,
                        cleanKey,
                        name,
                        displayName,
                        item.Description,
                        item.Icon,
                        item.Color,
                        item.SortOrder,
                        displayConfig
                    );

                    db.ContentTypes.Add(newType);
                    await db.SaveChangesAsync(ct);

                    var fields = item.FieldsConfig ?? DefaultEmptyArray;
                    var schemaResult = await schemaApi.UpsertSchemaAsync(
                        "ContentType",
                        newType.Id.ToString(),
                        newType.Name,
                        fields,
                        ct
                    );

                    if (schemaResult.IsFailed)
                    {
                        errors.Add(new ContentTypeImportError(cleanKey, $"Failed to create schema: {schemaResult.Errors.FirstOrDefault()?.Message}"));
                    }

                    createdCount++;
                }
            }
            catch (Exception ex)
            {
                errors.Add(new ContentTypeImportError(cleanKey, ex.Message));
            }
        }

        await db.SaveChangesAsync(ct);

        var result = new ImportContentTypesResult(
            TotalProcessed: items.Count,
            CreatedCount: createdCount,
            UpdatedCount: updatedCount,
            SkippedCount: skippedCount,
            Errors: errors
        );

        return Result.Ok(result);
    }
}
