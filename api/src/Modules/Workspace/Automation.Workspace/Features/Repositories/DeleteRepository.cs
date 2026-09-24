using Automation.Workspace.Infrastructure.Persistence;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Repositories;

public record DeleteRepositoryCommand(Guid Id);

public class DeleteRepositoryEndpoint(IMessageBus bus)
    : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("{id:guid}");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.Delete);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new DeleteRepositoryCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(WorkspaceDbContext))]
public class DeleteRepositoryHandler(WorkspaceDbContext db)
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
