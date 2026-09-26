using Automation.Runner.Infrastructure.Persistence;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record RevokeRunnerCommand(Guid Id);

public class RevokeRunnerEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Post("{id:guid}/revoke");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new RevokeRunnerCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class RevokeRunnerHandler(RunnerDbContext db)
{
    public async Task<Result> HandleAsync(RevokeRunnerCommand command, CancellationToken ct)
    {
        var runner = await db.Runners.FindAsync([command.Id], ct);
        if (runner is null)
            return Result.Fail($"Runner with ID '{command.Id}' was not found.");

        runner.IsActive = false;
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
