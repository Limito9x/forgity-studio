using Automation.Runner.Domain.Entities;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record RunnerExecutorConfigItemInput(
    string ExecutorKey,
    string ExecutablePath,
    string? Version
);

public record ReportExecutorConfigsRequest(
    IReadOnlyList<RunnerExecutorConfigItemInput> Configs
);

public record ReportExecutorConfigsCommand(
    Guid RunnerId,
    IReadOnlyList<RunnerExecutorConfigItemInput> Configs
);

public class ReportExecutorConfigsValidator : Validator<ReportExecutorConfigsCommand>
{
    public ReportExecutorConfigsValidator()
    {
        RuleFor(x => x.RunnerId).NotEmpty();
        RuleFor(x => x.Configs).NotNull();
        RuleForEach(x => x.Configs).ChildRules(cfg =>
        {
            cfg.RuleFor(c => c.ExecutorKey).NotEmpty().MaximumLength(50);
            cfg.RuleFor(c => c.ExecutablePath).NotEmpty().MaximumLength(500);
            cfg.RuleFor(c => c.Version).MaximumLength(50);
        });
    }
}

public class ReportExecutorConfigsEndpoint(IMessageBus bus)
    : Endpoint<ReportExecutorConfigsRequest, IReadOnlyList<RunnerExecutorConfigDto>>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/executor-configs");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(ReportExecutorConfigsRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new ReportExecutorConfigsCommand(runnerId, req.Configs);
        var result = await bus.InvokeAsync<Result<IReadOnlyList<RunnerExecutorConfigDto>>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class ReportExecutorConfigsHandler(RunnerDbContext db)
{
    public async Task<Result<IReadOnlyList<RunnerExecutorConfigDto>>> HandleAsync(ReportExecutorConfigsCommand command, CancellationToken ct)
    {
        var runner = await db.Runners
            .Include(x => x.ExecutorConfigs)
            .FirstOrDefaultAsync(x => x.Id == command.RunnerId, ct);

        if (runner is null)
            return Result.Fail($"Runner with ID '{command.RunnerId}' was not found.");

        foreach (var item in command.Configs)
        {
            var key = item.ExecutorKey.Trim().ToLowerInvariant();
            var existing = runner.ExecutorConfigs
                .FirstOrDefault(x => x.ExecutorKey.Equals(key, StringComparison.OrdinalIgnoreCase));

            if (existing is not null)
            {
                existing.ExecutablePath = item.ExecutablePath;
                existing.Version = item.Version;
            }
            else
            {
                var newConfig = new RunnerExecutorConfig
                {
                    RunnerId = command.RunnerId,
                    ExecutorKey = key,
                    ExecutablePath = item.ExecutablePath,
                    Version = item.Version
                };
                db.RunnerExecutorConfigs.Add(newConfig);
            }
        }

        await db.SaveChangesAsync(ct);

        var configs = await db.RunnerExecutorConfigs
            .AsNoTracking()
            .Where(x => x.RunnerId == command.RunnerId)
            .ProjectToType<RunnerExecutorConfigDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<RunnerExecutorConfigDto>>(configs);
    }
}
