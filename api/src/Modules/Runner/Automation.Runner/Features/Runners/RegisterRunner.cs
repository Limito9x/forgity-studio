using System.Security.Cryptography;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record RegisterRunnerCommand(string Name, string MachineKey);

public class RegisterRunnerValidator : AbstractValidator<RegisterRunnerCommand>
{
    public RegisterRunnerValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(150).WithMessage("Name must not exceed 150 characters.");

        RuleFor(x => x.MachineKey)
            .NotEmpty().WithMessage("MachineKey is required.")
            .MaximumLength(255).WithMessage("MachineKey must not exceed 255 characters.");
    }
}

public class RegisterRunnerEndpoint(IMessageBus bus) : Endpoint<RegisterRunnerCommand, RegisterRunnerResultDto>
{
    public override void Configure()
    {
        Post("register");
        Group<RunnersGroup>();
        Permissions(P.Runner.Create);
    }

    public override async Task HandleAsync(RegisterRunnerCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RegisterRunnerResultDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class RegisterRunnerHandler(RunnerDbContext db)
{
    public async Task<Result<RegisterRunnerResultDto>> HandleAsync(RegisterRunnerCommand command, CancellationToken ct)
    {
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
