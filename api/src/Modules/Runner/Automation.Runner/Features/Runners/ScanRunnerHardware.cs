using Automation.Runner.Contracts;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using RunnerDto = Automation.Runner.Shared.Dtos.RunnerDto;

namespace Automation.Runner.Features.Runners;

public record ScanRunnerHardwareCommand(Guid RunnerId);

public class ScanRunnerHardwareEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<RunnerDto>

{
    public override void Configure()
    {
        Post("{runnerId:guid}/hardware/scan");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new ScanRunnerHardwareCommand(runnerId);
        var result = await bus.InvokeAsync<Result<RunnerDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ScanRunnerHardwareHandler(IRunnerApi runnerApi, RunnerDbContext db)
{
    public async Task<Result<RunnerDto>> HandleAsync(ScanRunnerHardwareCommand command, CancellationToken ct)
    {
        var scanResult = await runnerApi.SendScanHardwareCommandAsync(command.RunnerId, ct);
        if (scanResult.IsFailed)
        {
            return Result.Fail<RunnerDto>(scanResult.Errors);
        }

        var runner = await db.Runners
            .AsNoTracking()
            .Include(x => x.ExecutorConfigs)
            .FirstOrDefaultAsync(x => x.Id == command.RunnerId, ct);

        if (runner is null)
        {
            return Result.Fail<RunnerDto>("Runner not found.");
        }

        return Result.Ok(runner.Adapt<RunnerDto>());
    }
}
