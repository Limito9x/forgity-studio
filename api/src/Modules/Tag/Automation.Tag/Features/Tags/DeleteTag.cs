using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Tag.Infrastructure.Persistence;

namespace Automation.Tag.Features.Tags;

public record DeleteTagCommand(Guid Id, bool DeleteChildren = true);

public class DeleteTagEndpoint(IMessageBus bus) : Endpoint<DeleteTagCommand>
{
    public override void Configure()
    {
        Delete("{id:guid}");
        Group<TagsGroup>();
        Permissions(P.Tag.Delete);
    }

    public override async Task HandleAsync(DeleteTagCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(TagDbContext))]
public class DeleteTagHandler(TagDbContext db)
{
    public async Task<Result> HandleAsync(DeleteTagCommand command, CancellationToken ct)
    {
        var tag = await db.TagItems.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (tag is null)
            return Result.Ok();

        if (command.DeleteChildren)
        {
            var descendants = await db.TagItems
                .Where(x => x.ProjectId == tag.ProjectId && x.Path.IsDescendantOf(tag.Path))
                .ToListAsync(ct);

            // Sort descendants deepest path first so children are deleted before parent
            var sortedDescendants = descendants
                .OrderByDescending(x => x.Path.ToString().Count(c => c == '.'))
                .ToList();

            db.TagItems.RemoveRange(sortedDescendants);
        }
        else
        {
            var hasChildren = await db.TagItems.AnyAsync(x => x.ParentId == tag.Id, ct);
            if (hasChildren)
            {
                return Result.Fail("Cannot delete tag because it has child tags. Specify DeleteChildren to remove descendants.");
            }

            db.TagItems.Remove(tag);
        }

        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }
}
