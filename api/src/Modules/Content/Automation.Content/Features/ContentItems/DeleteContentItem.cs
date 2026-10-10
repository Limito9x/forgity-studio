using Microsoft.EntityFrameworkCore;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;

namespace Automation.Content.Features.ContentItems;

public record DeleteContentItemCommand
{
    public Guid? Id { get; set; }
    public Guid? ProjectId { get; set; }
    public string? ContentTypeKey { get; set; }
    public string? KeyOrId { get; set; }
}

public class DeleteContentItemEndpoint(IMessageBus bus)
    : Endpoint<DeleteContentItemCommand>
{
    public override void Configure()
    {
        Delete(ContentRoutes.NestedContentItemDetail);
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
        Domain.Entities.ContentItem? item = null;

        if (command.Id.HasValue && command.Id.Value != Guid.Empty)
        {
            item = await db.ContentItems.FirstOrDefaultAsync(x => x.Id == command.Id.Value, ct);
        }
        else if (!string.IsNullOrWhiteSpace(command.KeyOrId))
        {
            if (Guid.TryParse(command.KeyOrId, out var parsedGuid))
            {
                item = await db.ContentItems.FirstOrDefaultAsync(x => x.Id == parsedGuid, ct);
            }
            else if (command.ProjectId.HasValue && !string.IsNullOrWhiteSpace(command.ContentTypeKey))
            {
                item = await db.ContentItems
                    .Include(x => x.ContentType)
                    .FirstOrDefaultAsync(x => x.ProjectId == command.ProjectId.Value && x.ContentType.Key == command.ContentTypeKey && x.Key == command.KeyOrId, ct);
            }
        }

        if (item is null) return Result.Fail(new NotFoundError("ContentItem not found"));
        
        db.ContentItems.Remove(item);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok();
    }
}
