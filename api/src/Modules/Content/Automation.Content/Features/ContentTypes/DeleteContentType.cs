using Microsoft.EntityFrameworkCore;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;

namespace Automation.Content.Features.ContentTypes;

public record DeleteContentTypeCommand(Guid Id);

public class DeleteContentTypeEndpoint(IMessageBus bus)
    : Endpoint<DeleteContentTypeCommand>
{
    public override void Configure()
    {
        Delete(ContentRoutes.ContentType);
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.Delete);
        Description(x => x.WithName("DeleteContentType"));
    }

    public override async Task HandleAsync(
        DeleteContentTypeCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class DeleteContentTypeHandler(ContentDbContext db)
{
    public async Task<Result> HandleAsync(
        DeleteContentTypeCommand command,
        CancellationToken ct)
    {
        var item = await db.ContentTypes.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (item is null) return Result.Fail(new NotFoundError("ContentType not found"));
        
        db.ContentTypes.Remove(item);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok();
    }
}
