using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Automation.SharedKernel.Abstractions.Auth;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GetMyRunnerQuery(Guid RunnerId);

public class GetMyRunnerEndpoint(IMessageBus bus, ICurrentRunner currentRunner) : EndpointWithoutRequest<RunnerDto>
{
    public override void Configure()
    {
        Get("me");
        Group<RunnersGroup>();
        AllowAnonymous(); // Auth via X-Runner-Key / X-Agent-Key header
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        if (!currentRunner.IsRunnerRequest || !currentRunner.RunnerId.HasValue)
        {
            await this.SendResultAsync(Result.Fail("Unauthorized"), ct);
            return;
        }

        var result = await bus.InvokeAsync<Result<RunnerDto>>(new GetMyRunnerQuery(currentRunner.RunnerId.Value), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetMyRunnerHandler(RunnerDbContext db)
{
    public async Task<Result<RunnerDto>> HandleAsync(GetMyRunnerQuery query, CancellationToken ct)
    {
        var runner = await db.Runners
            .AsNoTracking()
            .Where(x => x.Id == query.RunnerId)
            .ProjectToType<RunnerDto>()
            .FirstOrDefaultAsync(ct);

        if (runner is null)
            return Result.Fail("Runner not found or inactive.");

        return Result.Ok(runner);
    }
}
