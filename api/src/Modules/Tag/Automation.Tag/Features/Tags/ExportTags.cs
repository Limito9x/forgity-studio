using Automation.Tag.Infrastructure.Persistence;
using Automation.Tag.Shared.Dtos;
using Wolverine.Attributes;

namespace Automation.Tag.Features.Tags;

public record ExportTagsQuery(Guid ProjectId);

public record TagExportItemDto(
    string Path,
    string Name,
    string? Color,
    string? Description
);

public record TagExportPackageDto(
    string FormatVersion,
    DateTimeOffset ExportedAt,
    int TotalTags,
    List<TagExportItemDto> Tags
);

public class ExportTagsValidator : Validator<ExportTagsQuery>
{
    public ExportTagsValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
    }
}

public class ExportTagsEndpoint(IMessageBus bus) : Endpoint<ExportTagsQuery, TagExportPackageDto>
{
    public override void Configure()
    {
        Get("export");
        Group<TagsGroup>();
        Permissions(P.Tag.GetAll);
        Description(x => x.WithName("ExportTags"));
    }

    public override async Task HandleAsync(ExportTagsQuery query, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<TagExportPackageDto>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ExportTagsHandler(TagDbContext db)
{
    public async Task<Result<TagExportPackageDto>> HandleAsync(ExportTagsQuery query, CancellationToken ct)
    {
        var tags = await db.TagItems.AsNoTracking()
            .Where(t => t.ProjectId == query.ProjectId)
            .OrderBy(t => (string)t.Path)
            .Select(t => new TagExportItemDto(
                t.Path,
                t.Name,
                t.Color,
                t.Description
            ))
            .ToListAsync(ct);

        var package = new TagExportPackageDto(
            FormatVersion: "1.0",
            ExportedAt: DateTimeOffset.UtcNow,
            TotalTags: tags.Count,
            Tags: tags
        );

        return Result.Ok(package);
    }
}
