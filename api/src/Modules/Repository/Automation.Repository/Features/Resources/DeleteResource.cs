using Automation.Repository.Constants;
using Automation.Repository.Infrastructure.Persistence;
using FastEndpoints;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Resources;

// 1. Command
public record DeleteResourceCommand(Guid Id);

// 2. Endpoint
public class DeleteResourceEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("/{id:guid}");
        Group<ResourcesGroup>();
        Permissions(P.Resource.Delete);
        Description(x => x.WithName("DeleteResource"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new DeleteResourceCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[Transactional(typeof(RepositoryDbContext))]
public class DeleteResourceHandler(RepositoryDbContext db)
{
    public async Task<Result> HandleAsync(DeleteResourceCommand command, CancellationToken ct)
    {
        var resource = await db.ResourceItems.FindAsync([command.Id], ct);
        if (resource is null)
            return Result.Fail($"Resource with ID '{command.Id}' was not found.");

        db.ResourceItems.Remove(resource);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
