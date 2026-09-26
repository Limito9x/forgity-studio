using Automation.Runner.Domain.Entities;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record ConfigureRunnerExecutorRequest(
    string ExecutorKey,
    string ExecutablePath,
    string? Version
);

public record ConfigureRunnerExecutorCommand(
    Guid RunnerId,
    string ExecutorKey,
    string ExecutablePath,
    string? Version
);

public class ConfigureRunnerExecutorValidator : Validator<ConfigureRunnerExecutorCommand>
{
    public ConfigureRunnerExecutorValidator()
    {
        RuleFor(x => x.RunnerId).NotEmpty();
        RuleFor(x => x.ExecutorKey).NotEmpty().MaximumLength(50);
        RuleFor(x => x.ExecutablePath).NotEmpty().MaximumLength(500);
        RuleFor(x => x.Version).MaximumLength(50);
    }
}

public class ConfigureRunnerExecutorEndpoint(IMessageBus bus)
    : Endpoint<ConfigureRunnerExecutorRequest, RunnerExecutorConfigDto>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/executors");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(ConfigureRunnerExecutorRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new ConfigureRunnerExecutorCommand(runnerId, req.ExecutorKey, req.ExecutablePath, req.Version);
        var result = await bus.InvokeAsync<Result<RunnerExecutorConfigDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class ConfigureRunnerExecutorHandler(RunnerDbContext db)
{
    public async Task<Result<RunnerExecutorConfigDto>> HandleAsync(ConfigureRunnerExecutorCommand command, CancellationToken ct)
    {
        var runner = await db.Runners
            .Include(x => x.ExecutorConfigs)
            .FirstOrDefaultAsync(x => x.Id == command.RunnerId, ct);

        if (runner is null)
            return Result.Fail($"Runner with ID '{command.RunnerId}' was not found.");

        var existingConfig = runner.ExecutorConfigs
            .FirstOrDefault(x => x.ExecutorKey.Equals(command.ExecutorKey, StringComparison.OrdinalIgnoreCase));

        if (existingConfig is not null)
        {
            existingConfig.ExecutablePath = command.ExecutablePath;
            existingConfig.Version = command.Version;
        }
        else
        {
            existingConfig = new RunnerExecutorConfig
            {
                RunnerId = command.RunnerId,
                ExecutorKey = command.ExecutorKey.ToLowerInvariant(),
                ExecutablePath = command.ExecutablePath,
                Version = command.Version
            };
            db.RunnerExecutorConfigs.Add(existingConfig);
        }

        await db.SaveChangesAsync(ct);

        var dto = existingConfig.Adapt<RunnerExecutorConfigDto>();
        return Result.Ok(dto);
    }
}
