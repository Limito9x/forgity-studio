using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;

namespace Automation.Content.Features.ContentItems;

public record LookupContentItemsQuery(
    Guid ProjectId,
    Guid? ContentTypeId = null,
    string? ContentTypeKey = null,
    string? Keyword = null,
    int Limit = 50
);

public class LookupContentItemsEndpoint(IMessageBus bus)
    : Endpoint<LookupContentItemsQuery, List<ContentLookupDto>>
{
    public override void Configure()
    {
        Get(ContentRoutes.ContentItemsLookup);
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.GetAll);
        Description(x => x.WithName("LookupContentItems"));
    }

    public override async Task HandleAsync(
        LookupContentItemsQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<List<ContentLookupDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class LookupContentItemsHandler(ContentDbContext db)
{
    public async Task<Result<List<ContentLookupDto>>> HandleAsync(
        LookupContentItemsQuery query,
        CancellationToken ct)
    {
        var queryable = db.ContentItems
            .AsNoTracking()
            .Where(c => c.ProjectId == query.ProjectId);

        if (query.ContentTypeId.HasValue)
        {
            queryable = queryable.Where(c => c.ContentTypeId == query.ContentTypeId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(query.ContentTypeKey))
        {
            queryable = queryable.Where(c => c.ContentType.Key == query.ContentTypeKey);
        }

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            var kw = query.Keyword.Trim();
            queryable = queryable.Where(c => EF.Functions.ILike(c.Name, $"%{kw}%"));
        }

        var limit = query.Limit <= 0 ? 50 : Math.Min(query.Limit, 100);

        var items = await queryable
            .OrderBy(c => c.Name)
            .Take(limit)
            .Select(c => new ContentLookupDto(
                c.Id,
                c.Name,
                c.ContentTypeId,
                c.ContentType.Key,
                c.ContentType.Name,
                c.ContentType.Color,
                c.ContentType.Icon
            ))
            .ToListAsync(ct);

        return Result.Ok(items);
    }
}
