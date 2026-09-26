using Automation.Runner.Domain.Entities;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record UpdateRunnerHardwareProfileRequest(
    string? OsPlatform,
    string? CpuModel,
    long? TotalRamBytes,
    string? PrimaryGpuName,
    long? PrimaryGpuVramBytes,
    RunnerHardwareProfile? HardwareDetails
);

public record UpdateRunnerHardwareProfileCommand(
    Guid RunnerId,
    string? OsPlatform,
    string? CpuModel,
    long? TotalRamBytes,
    string? PrimaryGpuName,
    long? PrimaryGpuVramBytes,
    RunnerHardwareProfile? HardwareDetails
);

public class UpdateRunnerHardwareProfileEndpoint(IMessageBus bus)
    : Endpoint<UpdateRunnerHardwareProfileRequest, RunnerDto>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/hardware-profile");
        Group<RunnersGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(UpdateRunnerHardwareProfileRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new UpdateRunnerHardwareProfileCommand(
            runnerId,
            req.OsPlatform,
            req.CpuModel,
            req.TotalRamBytes,
            req.PrimaryGpuName,
            req.PrimaryGpuVramBytes,
            req.HardwareDetails
        );

        var result = await bus.InvokeAsync<Result<RunnerDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class UpdateRunnerHardwareProfileHandler(RunnerDbContext db)
{
    public async Task<Result<RunnerDto>> HandleAsync(
        UpdateRunnerHardwareProfileCommand command,
        CancellationToken ct
    )
    {
        var runner = await db.Runners
            .Include(x => x.ExecutorConfigs)
            .FirstOrDefaultAsync(x => x.Id == command.RunnerId, ct);

        if (runner is null)
        {
            return Result.Fail<RunnerDto>($"Runner with ID '{command.RunnerId}' was not found.");
        }

        runner.OsPlatform = command.OsPlatform ?? string.Empty;
        runner.CpuModel = command.CpuModel ?? string.Empty;
        runner.TotalRamBytes = command.TotalRamBytes ?? 0;
        runner.PrimaryGpuName = command.PrimaryGpuName ?? string.Empty;
        runner.PrimaryGpuVramBytes = command.PrimaryGpuVramBytes ?? 0;
        runner.HardwareDetails = command.HardwareDetails;
        runner.LastHardwareScannedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);


        return Result.Ok(runner.Adapt<RunnerDto>());
    }
}
