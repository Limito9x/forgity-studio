using System.Security.Cryptography;
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
        var cacheKey = $"agent_setup_token:{command.SetupToken}";
        var isValidToken = await cache.GetAsync<bool>(cacheKey, ct);

        if (!isValidToken)
        {
            return Result.Fail("Invalid or expired setup token");
        }

        // Consume the token (single use)
        await cache.RemoveAsync(cacheKey, ct);

        var existingRunner = await db.Runners
            .FirstOrDefaultAsync(x => x.MachineKey == command.MachineKey, ct);

        if (existingRunner is not null)
        {
            if (!existingRunner.IsActive)
            {
                existingRunner.IsActive = true;
                await db.SaveChangesAsync(ct);
            }

            return Result.Ok(new RegisterRunnerResultDto(
                existingRunner.Id,
                existingRunner.Name,
                existingRunner.MachineKey,
                existingRunner.RegistrationToken
            ));
        }

        var tokenBytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(tokenBytes);
        var registrationToken = Convert.ToBase64String(tokenBytes);

        var runner = new Domain.Entities.Runner
        {
            Name = command.Name,
            MachineKey = command.MachineKey,
            RegistrationToken = registrationToken,
            IsActive = true
        };

        db.Runners.Add(runner);
        await db.SaveChangesAsync(ct);

        return Result.Ok(new RegisterRunnerResultDto(
            runner.Id,
            runner.Name,
            runner.MachineKey,
            runner.RegistrationToken
        ));
    }
}
