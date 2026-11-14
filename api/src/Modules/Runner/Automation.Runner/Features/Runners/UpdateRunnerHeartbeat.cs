using Automation.Runner.Infrastructure.Persistence;
using Automation.SharedKernel.Abstractions.Agent;
using Automation.SharedKernel.Abstractions.Runner;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

[Transactional(typeof(RunnerDbContext))]
public class UpdateRunnerHeartbeatHandler(RunnerDbContext db)
{
    public async Task HandleAsync(UpdateRunnerHeartbeatCommand command, CancellationToken ct)
    {
        var runner = await db.Runners.FirstOrDefaultAsync(x => x.Id == command.RunnerId, ct);
        if (runner is not null)
        {
            runner.LastSeenAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task HandleAsync(UpdateAgentHeartbeatCommand command, CancellationToken ct)
    {
        var runner = await db.Runners.FirstOrDefaultAsync(x => x.Id == command.AgentId, ct);
        if (runner is not null)
        {
            runner.LastSeenAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
    }
}
