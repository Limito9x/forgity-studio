using System.Security.Cryptography;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Automation.SharedKernel.Infrastructure.RabbitMq;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
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
public class RegisterRunnerHandler(
    RunnerDbContext db,
    IRabbitMqProvisioningService? provisioningService = null,
    ILogger<RegisterRunnerHandler>? logger = null,
    IConfiguration? configuration = null
)
{
    public async Task<Result<RegisterRunnerResultDto>> HandleAsync(RegisterRunnerCommand command, CancellationToken ct)
    {
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

        var rmq = Automation.SharedKernel.Extensions.RabbitMq.SharedRabbitMqConfigHolder.Current;

        var publicGrpcUrl = configuration?["RunnerBootstrap:PublicGrpcUrl"]
            ?? configuration?["GRPC_URL"]
            ?? Environment.GetEnvironmentVariable("RUNNER_BOOTSTRAP_PUBLIC_GRPC_URL");

        var publicRmqHost = configuration?["RunnerBootstrap:PublicRabbitMqHost"]
            ?? configuration?["RABBITMQ_PUBLIC_HOST"]
            ?? (Uri.TryCreate(publicGrpcUrl, UriKind.Absolute, out var gUri) && !string.IsNullOrWhiteSpace(gUri.Host) ? gUri.Host : null)
            ?? rmq.Host;

        RabbitMqConfigDto rmqConfig;

        if (provisioningService != null)
        {
            var dynamicUsername = $"rn_{runnerId:N}";
            var dynamicPassword = GenerateSecurePassword(32);

            var provisionResult = await provisioningService.ProvisionRunnerUserAsync(
                dynamicUsername,
                dynamicPassword,
                rmq.VirtualHost,
                runnerId,
                ct
            );

            if (provisionResult.IsSuccess)
            {
                rmqConfig = new RabbitMqConfigDto(
                    publicRmqHost,
                    rmq.Port,
                    dynamicUsername,
                    dynamicPassword,
                    rmq.VirtualHost
                );
            }
            else
            {
                logger?.LogWarning(
                    "Failed to provision dynamic RabbitMQ user for runner {RunnerId}: {Error}. Falling back to default shared credentials.",
                    runnerId,
                    string.Join("; ", provisionResult.Errors.Select(e => e.Message))
                );
                rmqConfig = new RabbitMqConfigDto(publicRmqHost, rmq.Port, rmq.Username, rmq.Password, rmq.VirtualHost);
            }
        }
        else
        {
            rmqConfig = new RabbitMqConfigDto(publicRmqHost, rmq.Port, rmq.Username, rmq.Password, rmq.VirtualHost);
        }

        return Result.Ok(new RegisterRunnerResultDto(
            runnerId,
            runnerName,
            machineKey,
            registrationToken,
            rmqConfig,
            publicGrpcUrl
        ));
    }

    private static string GenerateSecurePassword(int length = 32)
    {
        const string validChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
        var bytes = RandomNumberGenerator.GetBytes(length);
        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = validChars[bytes[i] % validChars.Length];
        }
        return new string(chars);
    }
}
