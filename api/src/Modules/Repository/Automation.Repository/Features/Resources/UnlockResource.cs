using Automation.Repository.Constants;
using Automation.Repository.Infrastructure.Persistence;
using FastEndpoints;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Resources;

// 1. Command
public record UnlockResourceCommand(Guid Id);

// 2. Endpoint
public class UnlockResourceEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Post("/{id:guid}/unlock");
        Group<ResourcesGroup>();
        Permissions(P.Resource.Update);
        Description(x => x.WithName("UnlockResource"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new UnlockResourceCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[Transactional(typeof(RepositoryDbContext))]
public class UnlockResourceHandler(RepositoryDbContext db)
{
    public async Task<Result> HandleAsync(UnlockResourceCommand command, CancellationToken ct)
    {
        var resource = await db.ResourceItems.FindAsync([command.Id], ct);
        if (resource is null)
            return Result.Fail($"Resource with ID '{command.Id}' was not found.");

        resource.Unlock();
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
