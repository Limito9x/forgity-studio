using Automation.Runner.Infrastructure.Persistence;
using Automation.SharedKernel.Infrastructure.RabbitMq;
using Microsoft.Extensions.Logging;
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
public class RevokeRunnerHandler(
    RunnerDbContext db,
    IRabbitMqProvisioningService? provisioningService = null,
    ILogger<RevokeRunnerHandler>? logger = null
)
{
    public async Task<Result> HandleAsync(RevokeRunnerCommand command, CancellationToken ct)
    {
        var runner = await db.Runners.FindAsync([command.Id], ct);
        if (runner is null)
            return Result.Fail($"Runner with ID '{command.Id}' was not found.");

        runner.IsActive = false;
        await db.SaveChangesAsync(ct);

        if (provisioningService != null)
        {
            var dynamicUsername = $"rn_{runner.Id:N}";
            var revokeResult = await provisioningService.RevokeRunnerUserAsync(dynamicUsername, ct);
            if (revokeResult.IsFailed)
            {
                logger?.LogWarning(
                    "Failed to revoke RabbitMQ user '{Username}' for revoked runner {RunnerId}: {Error}",
                    dynamicUsername,
                    runner.Id,
                    string.Join("; ", revokeResult.Errors.Select(e => e.Message))
                );
            }
        }

        return Result.Ok();
    }
}
