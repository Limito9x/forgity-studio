using System.Security.Cryptography;
using Automation.SharedKernel.Abstractions.Caching;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GenerateSetupTokenRequest(Guid? StudioId = null);

public record GenerateSetupTokenCommand(Guid? StudioId = null);

public record SetupTokenDto(string Token, DateTimeOffset ExpiresAt, Guid? StudioId = null);

public record RunnerSetupTokenMetadata(Guid? StudioId, string? CreatedBy);

public class GenerateSetupTokenEndpoint(IMessageBus bus) : Endpoint<GenerateSetupTokenRequest, SetupTokenDto>
{
    public override void Configure()
    {
        Post("generate-token");
        Group<RunnersGroup>();
        Permissions(P.Runner.Create);
    }

    public override async Task HandleAsync(GenerateSetupTokenRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<SetupTokenDto>>(new GenerateSetupTokenCommand(req.StudioId), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GenerateSetupTokenHandler(ICacheService cache)
{
    public async Task<Result<SetupTokenDto>> HandleAsync(GenerateSetupTokenCommand command, CancellationToken ct)
    {
        var tokenBytes = new byte[12];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(tokenBytes);
        var token = "AGT-" + Convert.ToHexString(tokenBytes);

        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(30);
        var cacheKey = $"runner_setup_token:{token}";

        var metadata = new RunnerSetupTokenMetadata(command.StudioId, null);
        await cache.SetAsync(cacheKey, metadata, TimeSpan.FromMinutes(30), ct);

        // Also set legacy key for backwards compatibility
        await cache.SetAsync($"agent_setup_token:{token}", true, TimeSpan.FromMinutes(30), ct);

        return Result.Ok(new SetupTokenDto(token, expiresAt, command.StudioId));
    }
}
