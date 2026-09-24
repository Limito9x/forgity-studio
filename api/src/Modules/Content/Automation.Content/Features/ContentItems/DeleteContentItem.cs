using Microsoft.EntityFrameworkCore;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;

namespace Automation.Content.Features.ContentItems;

public record DeleteContentItemCommand(Guid Id);

public class DeleteContentItemEndpoint(IMessageBus bus)
    : Endpoint<DeleteContentItemCommand>
{
    public override void Configure()
    {
        Delete(ContentRoutes.ContentItem);
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.Delete);
        Description(x => x.WithName("DeleteContentItem"));
    }

    public override async Task HandleAsync(
        DeleteContentItemCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class DeleteContentItemHandler(ContentDbContext db)
{
    public async Task<Result> HandleAsync(
        DeleteContentItemCommand command,
        CancellationToken ct)
    {
        var item = await db.ContentItems.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (item is null) return Result.Fail(new NotFoundError("ContentItem not found"));
        
        db.ContentItems.Remove(item);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok();
    }
}
