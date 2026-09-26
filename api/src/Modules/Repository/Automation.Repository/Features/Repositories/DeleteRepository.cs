using Automation.Repository.Infrastructure.Persistence;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Repositories;

public record DeleteRepositoryCommand(Guid Id);

public class DeleteRepositoryEndpoint(IMessageBus bus)
    : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("{id:guid}");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.Delete);
        Description(x => x.WithName("DeleteRepository"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new DeleteRepositoryCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RepositoryDbContext))]
public class DeleteRepositoryHandler(RepositoryDbContext db)
{
    public async Task<Result> HandleAsync(DeleteRepositoryCommand command, CancellationToken ct)
    {
        var repo = await db.Repositories.FindAsync([command.Id], ct);
        if (repo is null)
            return Result.Fail($"Repository with ID '{command.Id}' was not found.");

        db.Repositories.Remove(repo);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
