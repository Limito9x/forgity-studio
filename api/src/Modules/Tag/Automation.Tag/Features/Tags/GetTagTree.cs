using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Tag.Infrastructure.Persistence;
using Automation.Tag.Shared.Dtos;

namespace Automation.Tag.Features.Tags;

public record GetTagTreeQuery(Guid ProjectId, string? RootPath = null);

public class GetTagTreeEndpoint(IMessageBus bus) : Endpoint<GetTagTreeQuery, IReadOnlyList<TagTreeNodeDto>>
{
    public override void Configure()
    {
        Get("tree");
        Group<TagsGroup>();
        Permissions(P.Tag.GetAll);
    }

    public override async Task HandleAsync(GetTagTreeQuery query, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<TagTreeNodeDto>>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetTagTreeHandler(TagDbContext db)
{
    public async Task<Result<IReadOnlyList<TagTreeNodeDto>>> HandleAsync(GetTagTreeQuery query, CancellationToken ct)
    {
        var tagsQuery = db.TagItems.AsNoTracking()
            .Where(x => x.ProjectId == query.ProjectId);

        if (!string.IsNullOrWhiteSpace(query.RootPath))
            tagsQuery = tagsQuery.Where(x => x.Path.IsDescendantOf(query.RootPath));

        var flatTags = await tagsQuery
            .OrderBy(x => x.Path)
            .ToListAsync(ct);

        var nodeMap = flatTags.ToDictionary(
            t => t.Id,
            t => new TagTreeNodeDto(t.Id, t.Path, t.Name, t.Color, t.Description, [])
        );

        var rootNodes = new List<TagTreeNodeDto>();
        foreach (var tag in flatTags)
        {
            var current = nodeMap[tag.Id];
            if (tag.ParentId.HasValue && nodeMap.TryGetValue(tag.ParentId.Value, out var parentNode))
            {
                parentNode.Children.Add(current);
            }
            else
            {
                rootNodes.Add(current);
            }
        }

        return Result.Ok<IReadOnlyList<TagTreeNodeDto>>(rootNodes);
    }
}
