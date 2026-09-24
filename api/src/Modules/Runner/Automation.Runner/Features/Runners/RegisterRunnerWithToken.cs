using System.Security.Cryptography;
using Automation.Runner.Domain.Entities;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Automation.SharedKernel.Abstractions.Caching;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record RegisterRunnerWithTokenCommand(string Name, string MachineKey, string SetupToken);

public class RegisterRunnerWithTokenValidator : Validator<RegisterRunnerWithTokenCommand>
{
    public RegisterRunnerWithTokenValidator()
    {
        RuleFor(x => x.SetupToken)
            .NotEmpty().WithMessage("Setup token is required");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required");

        RuleFor(x => x.MachineKey)
            .NotEmpty().WithMessage("Machine key is required");
    }
}

public class RegisterRunnerWithTokenEndpoint(IMessageBus bus)
    : Endpoint<RegisterRunnerWithTokenCommand, RegisterRunnerResultDto>
{
    public override void Configure()
    {
        Post("register-token");
        Group<RunnersGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(RegisterRunnerWithTokenCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RegisterRunnerResultDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class RegisterRunnerWithTokenHandler(RunnerDbContext db, ICacheService cache)
{
    public async Task<Result<RegisterRunnerResultDto>> HandleAsync(RegisterRunnerWithTokenCommand command, CancellationToken ct)
    {
        var runnerCacheKey = $"runner_setup_token:{command.SetupToken}";
        var legacyCacheKey = $"agent_setup_token:{command.SetupToken}";

        var metadata = await cache.GetAsync<RunnerSetupTokenMetadata>(runnerCacheKey, ct);
        var isValidLegacy = metadata is null && await cache.GetAsync<bool>(legacyCacheKey, ct);

        if (metadata is null && !isValidLegacy)
        {
            return Result.Fail("Invalid or expired setup token");
        }

        // Consume the token (single use)
        await cache.RemoveAsync(runnerCacheKey, ct);
        await cache.RemoveAsync(legacyCacheKey, ct);

        var existingRunner = await db.Runners
            .FirstOrDefaultAsync(x => x.MachineKey == command.MachineKey, ct);

        Guid runnerId;
        string runnerName;
        string machineKey;
        string registrationToken;

        if (existingRunner is not null)
        {
            if (!existingRunner.IsActive)
            {
                existingRunner.IsActive = true;
                await db.SaveChangesAsync(ct);
            }

            runnerId = existingRunner.Id;
            runnerName = existingRunner.Name;
            machineKey = existingRunner.MachineKey;
            registrationToken = existingRunner.RegistrationToken;
        }
        else
        {
            var tokenBytes = new byte[32];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(tokenBytes);
            registrationToken = Convert.ToBase64String(tokenBytes);

            var runner = new Domain.Entities.Runner
            {
                Name = command.Name,
                MachineKey = command.MachineKey,
                RegistrationToken = registrationToken,
                IsActive = true
            };

            db.Runners.Add(runner);
            await db.SaveChangesAsync(ct);

            runnerId = runner.Id;
            runnerName = runner.Name;
            machineKey = runner.MachineKey;
        }

        // Auto-link to Studio if token has StudioId
        if (metadata?.StudioId.HasValue == true)
        {
            var studioId = metadata.StudioId.Value;
            var existingLink = await db.RunnerStudios
                .FirstOrDefaultAsync(rs => rs.RunnerId == runnerId && rs.StudioId == studioId, ct);

            if (existingLink is null)
            {
                db.RunnerStudios.Add(new RunnerStudio
                {
                    RunnerId = runnerId,
                    StudioId = studioId,
                    IsApproved = true
                });
                await db.SaveChangesAsync(ct);
            }
        }

        return Result.Ok(new RegisterRunnerResultDto(
            runnerId,
            runnerName,
            machineKey,
            registrationToken
        ));
    }
}
