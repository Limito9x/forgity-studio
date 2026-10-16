using System.Security.Cryptography;
using Automation.Runner.Domain.Entities;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Automation.SharedKernel.Abstractions.Caching;
using Automation.SharedKernel.Infrastructure.RabbitMq;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
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
public class RegisterRunnerWithTokenHandler(
    RunnerDbContext db,
    ICacheService cache,
    IRabbitMqProvisioningService? provisioningService = null,
    ILogger<RegisterRunnerWithTokenHandler>? logger = null,
    IConfiguration? configuration = null
)
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

        // Cache the claimed/connected status for Real-time pairing handshake with Web UI
        var statusDto = new RunnerTokenStatusDto("connected", runnerId, runnerName, machineKey, DateTimeOffset.UtcNow);
        await cache.SetAsync($"runner_token_status:{command.SetupToken}", statusDto, TimeSpan.FromMinutes(10), ct);

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

public record RunnerTokenStatusDto(
    string Status,
    Guid? RunnerId = null,
    string? RunnerName = null,
    string? MachineKey = null,
    DateTimeOffset? ConnectedAt = null
);
