using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Infrastructure.Persistence;
using Automation.DynamicForms.Contracts;

namespace Automation.Content.Features.ContentTypes;

public record ExportContentTypesQuery(
    Guid ProjectId,
    string? Keys = null,
    string? Ids = null
);

public record ContentTypeExportItemDto(
    string Key,
    string Name,
    string DisplayName,
    string? Description,
    string? Icon,
    string? Color,
    int SortOrder,
    JsonDocument? DisplayConfig,
    JsonDocument? FieldsConfig
);

public record ContentTypeExportPackageDto(
    string FormatVersion,
    DateTimeOffset ExportedAt,
    int TotalTypes,
    List<ContentTypeExportItemDto> ContentTypes
);

public class ExportContentTypesValidator : Validator<ExportContentTypesQuery>
{
    public ExportContentTypesValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
    }
}

public class ExportContentTypesEndpoint(IMessageBus bus)
    : Endpoint<ExportContentTypesQuery, ContentTypeExportPackageDto>
{
    public override void Configure()
    {
        Get(ContentRoutes.NestedContentTypes + "/export");
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.GetAll);
        Description(x => x.WithName("ExportContentTypes"));
    }

    public override async Task HandleAsync(ExportContentTypesQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentTypeExportPackageDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ExportContentTypesHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result<ContentTypeExportPackageDto>> HandleAsync(
        ExportContentTypesQuery query,
        CancellationToken ct)
    {
        var queryable = db.ContentTypes.AsNoTracking()
            .Where(x => x.ProjectId == query.ProjectId);

        if (!string.IsNullOrWhiteSpace(query.Ids))
        {
            var idList = query.Ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty)
                .ToList();

            if (idList.Count > 0)
            {
                queryable = queryable.Where(x => idList.Contains(x.Id));
            }
        }
        else if (!string.IsNullOrWhiteSpace(query.Keys))
        {
            var keyList = query.Keys.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (keyList.Length > 0)
            {
                queryable = queryable.Where(x => keyList.Contains(x.Key));
            }
        }

        var types = await queryable
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .ToListAsync(ct);

        var exportItems = new List<ContentTypeExportItemDto>(types.Count);

        foreach (var item in types)
        {
            var schemaResult = await schemaApi.GetActiveVersionWithDependenciesAsync("ContentType", item.Id.ToString(), ct);
            var fieldsConfig = schemaResult.IsSuccess ? schemaResult.Value.ActiveVersion?.Fields : null;

            exportItems.Add(new ContentTypeExportItemDto(
                item.Key,
                item.Name,
                item.DisplayName,
                item.Description,
                item.Icon,
                item.Color,
                item.SortOrder,
                item.DisplayConfig,
                fieldsConfig
            ));
        }

        var package = new ContentTypeExportPackageDto(
            FormatVersion: "1.0",
            ExportedAt: DateTimeOffset.UtcNow,
            TotalTypes: exportItems.Count,
            ContentTypes: exportItems
        );

        return Result.Ok(package);
    }
}
