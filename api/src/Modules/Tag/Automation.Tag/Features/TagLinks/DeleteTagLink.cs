using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Tag.Infrastructure.Persistence;

namespace Automation.Tag.Features.TagLinks;

public record DeleteTagLinkCommand(Guid Id);

public class DeleteTagLinkEndpoint(IMessageBus bus) : Endpoint<DeleteTagLinkCommand>
{
    public override void Configure()
    {
        Delete("{id:guid}");
        Group<TagLinksGroup>();
        Permissions(P.TagLink.Delete);
    }

    public override async Task HandleAsync(DeleteTagLinkCommand command, CancellationToken ct)
    {
        command = command with { Id = Route<Guid>("id") };
        var result = await bus.InvokeAsync<Result>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(TagDbContext))]
public class DeleteTagLinkHandler(TagDbContext db)
{
    public async Task<Result> HandleAsync(DeleteTagLinkCommand command, CancellationToken ct)
    {
        var link = await db.TagLinks.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (link is null)
            return Result.Ok();

        db.TagLinks.Remove(link);
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }
}
