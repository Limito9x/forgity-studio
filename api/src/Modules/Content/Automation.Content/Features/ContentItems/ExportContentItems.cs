using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Infrastructure.Persistence;
using Automation.DynamicForms.Contracts;

namespace Automation.Content.Features.ContentItems;

public record ExportContentItemsQuery(
    Guid ProjectId,
    string ContentTypeKey,
    string? Format = "json",
    string? Ids = null,
    string? Keys = null
);

public record ContentItemExportItemDto(
    string Key,
    string Name,
    JsonDocument? Values
);

public record ContentItemExportPackageDto(
    string FormatVersion,
    DateTimeOffset ExportedAt,
    string ContentTypeKey,
    int TotalItems,
    List<ContentItemExportItemDto> Items,
    string? CsvContent = null
);

public class ExportContentItemsValidator : Validator<ExportContentItemsQuery>
{
    public ExportContentItemsValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.ContentTypeKey).NotEmpty();
    }
}

public class ExportContentItemsEndpoint(IMessageBus bus)
    : Endpoint<ExportContentItemsQuery, ContentItemExportPackageDto>
{
    public override void Configure()
    {
        Get(ContentRoutes.NestedContentItems + "/export");
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.GetAll);
        Description(x => x.WithName("ExportContentItems"));
    }

    public override async Task HandleAsync(ExportContentItemsQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentItemExportPackageDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ExportContentItemsHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result<ContentItemExportPackageDto>> HandleAsync(
        ExportContentItemsQuery query,
        CancellationToken ct)
    {
        var contentType = await db.ContentTypes
            .FirstOrDefaultAsync(c => c.ProjectId == query.ProjectId && c.Key == query.ContentTypeKey, ct);

        if (contentType is null)
        {
            return Result.Fail(new NotFoundError($"ContentType with key '{query.ContentTypeKey}' not found"));
        }

        var queryable = db.ContentItems
            .AsNoTracking()
            .Where(x => x.ProjectId == query.ProjectId && x.ContentTypeId == contentType.Id);

        if (!string.IsNullOrWhiteSpace(query.Ids))
        {
            var idList = query.Ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(idStr => Guid.TryParse(idStr, out var id) ? id : Guid.Empty)
                .Where(id => id != Guid.Empty)
                .ToList();

            if (idList.Count > 0)
            {
                queryable = queryable.Where(x => idList.Contains(x.Id));
            }
        }
        else if (!string.IsNullOrWhiteSpace(query.Keys))
        {
            var keyList = query.Keys.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();

            if (keyList.Count > 0)
            {
                queryable = queryable.Where(x => keyList.Contains(x.Key));
            }
        }

        var items = await queryable
            .OrderBy(x => x.Name)
            .ToListAsync(ct);

        var itemIds = items.Select(x => x.Id.ToString()).ToList();
        var dataResult = await schemaApi.GetMultipleDataAsync(itemIds, contentType.Key, ct);
        var valuesMap = dataResult.IsSuccess
            ? dataResult.Value.ToDictionary(d => d.ClientId, d => d.Values)
            : new Dictionary<string, JsonDocument?>();

        var exportItems = items.Select(item =>
        {
            valuesMap.TryGetValue(item.Id.ToString(), out var values);
            return new ContentItemExportItemDto(
                item.Key,
                item.Name,
                values
            );
        }).ToList();

        string? csvContent = null;
        if (string.Equals(query.Format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            csvContent = BuildCsv(exportItems);
        }

        return Result.Ok(new ContentItemExportPackageDto(
            "1.0",
            DateTimeOffset.UtcNow,
            contentType.Key,
            exportItems.Count,
            exportItems,
            csvContent
        ));
    }

    private static string BuildCsv(List<ContentItemExportItemDto> items)
    {
        var sb = new StringBuilder();
        
        // Collect all distinct value field keys across items
        var valueKeys = new HashSet<string>();
        foreach (var item in items)
        {
            if (item.Values != null && item.Values.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in item.Values.RootElement.EnumerateObject())
                {
                    valueKeys.Add(prop.Name);
                }
            }
        }

        var sortedKeys = valueKeys.OrderBy(k => k).ToList();

        // Write CSV Header
        sb.Append("Name,Key");
        foreach (var key in sortedKeys)
        {
            sb.Append(',').Append(EscapeCsv(key));
        }
        sb.AppendLine();

        // Write Rows
        foreach (var item in items)
        {
            sb.Append(EscapeCsv(item.Name)).Append(',').Append(EscapeCsv(item.Key));

            foreach (var key in sortedKeys)
            {
                sb.Append(',');
                if (item.Values != null && item.Values.RootElement.ValueKind == JsonValueKind.Object &&
                    item.Values.RootElement.TryGetProperty(key, out var prop))
                {
                    sb.Append(EscapeCsv(GetJsonElementAsString(prop)));
                }
            }
            sb.AppendLine();
        }

        return sb.ToString();
    }

    private static string GetJsonElementAsString(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString() ?? "",
            JsonValueKind.Number => element.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null or JsonValueKind.Undefined => "",
            _ => element.GetRawText()
        };
    }

    private static string EscapeCsv(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }
        return value;
    }
}
