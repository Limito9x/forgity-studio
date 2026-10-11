using Automation.SharedKernel.Abstractions.Caching;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GetSetupTokenStatusRequest
{
    public string Token { get; init; } = default!;
}

public record GetSetupTokenStatusCommand(string Token);

public class GetSetupTokenStatusEndpoint(IMessageBus bus)
    : Endpoint<GetSetupTokenStatusRequest, RunnerTokenStatusDto>
{
    public override void Configure()
    {
        Get("tokens/{token}/status");
        Group<RunnersGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(GetSetupTokenStatusRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RunnerTokenStatusDto>>(new GetSetupTokenStatusCommand(req.Token), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetSetupTokenStatusHandler(ICacheService cache)
{
    public async Task<Result<RunnerTokenStatusDto>> HandleAsync(GetSetupTokenStatusCommand command, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(command.Token))
        {
            return Result.Ok(new RunnerTokenStatusDto("expired"));
        }

        // 1. Check if token was recently connected/claimed
        var connectedStatus = await cache.GetAsync<RunnerTokenStatusDto>($"runner_token_status:{command.Token}", ct);
        if (connectedStatus is not null)
        {
            return Result.Ok(connectedStatus);
        }

        // 2. Check if token is still active and pending pairing
        var pendingMetadata = await cache.GetAsync<RunnerSetupTokenMetadata>($"runner_setup_token:{command.Token}", ct);
        var isLegacyPending = pendingMetadata is null && await cache.GetAsync<bool>($"agent_setup_token:{command.Token}", ct);

        if (pendingMetadata is not null || isLegacyPending)
        {
            return Result.Ok(new RunnerTokenStatusDto("pending"));
        }

        // 3. Otherwise token is expired or non-existent
        return Result.Ok(new RunnerTokenStatusDto("expired"));
    }
}
