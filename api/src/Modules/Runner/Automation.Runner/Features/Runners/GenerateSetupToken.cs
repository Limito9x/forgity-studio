using System.Security.Cryptography;
using Automation.SharedKernel.Abstractions.Caching;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GenerateSetupTokenCommand();

public record SetupTokenDto(string Token, DateTimeOffset ExpiresAt);

public class GenerateSetupTokenEndpoint(IMessageBus bus) : EndpointWithoutRequest<SetupTokenDto>
{
    public override void Configure()
    {
        Post("generate-token");
        Group<RunnersGroup>();
        Permissions(P.Runner.Create);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<SetupTokenDto>>(new GenerateSetupTokenCommand(), ct);
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
        var cacheKey = $"agent_setup_token:{token}";

        await cache.SetAsync(cacheKey, true, TimeSpan.FromMinutes(30), ct);

        return Result.Ok(new SetupTokenDto(token, expiresAt));
    }
}
