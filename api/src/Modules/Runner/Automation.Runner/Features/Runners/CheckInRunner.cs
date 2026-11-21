using Automation.Runner.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record CheckInRunnerRequest(
    string HardwareFingerprint,
    string MachineKey,
    string Name,
    string? OsPlatform = null,
    string? AppVersion = null
);

public record CheckInRunnerResponse(
    Guid RunnerId,
    string MachineKey,
    string HardwareFingerprint,
    bool IsActive
);

public class CheckInRunnerEndpoint(IMessageBus bus)
    : Endpoint<CheckInRunnerRequest, CheckInRunnerResponse>
{
    public override void Configure()
    {
        Post("check-in");
        Group<RunnersGroup>();
        AllowAnonymous();
        Description(b => b.WithSummary("Device-first auto check-in for desktop workstations (quota identity)"));
    }

    public override async Task HandleAsync(CheckInRunnerRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<CheckInRunnerResponse>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class CheckInRunnerHandler(RunnerDbContext db)
{
    public async Task<Result<CheckInRunnerResponse>> HandleAsync(
        CheckInRunnerRequest req,
        CancellationToken ct)
    {
        var fingerprint = req.HardwareFingerprint.Trim();
        var machineKey = string.IsNullOrWhiteSpace(req.MachineKey)
            ? fingerprint
            : req.MachineKey.Trim();

        if (string.IsNullOrWhiteSpace(fingerprint))
        {
            return Result.Fail<CheckInRunnerResponse>("HardwareFingerprint is required.");
        }

        var existing = await db.Runners.FirstOrDefaultAsync(
            x => x.HardwareFingerprint == fingerprint || x.MachineKey == machineKey,
            ct);

        if (existing is null)
        {
            existing = new Domain.Entities.Runner
            {
                Name = string.IsNullOrWhiteSpace(req.Name) ? machineKey : req.Name.Trim(),
                MachineKey = machineKey,
                HardwareFingerprint = fingerprint,
                RegistrationToken = string.Empty,
                OsPlatform = req.OsPlatform?.Trim() ?? string.Empty,
                AppVersion = req.AppVersion?.Trim(),
                IsActive = true,
                LastSeenAt = DateTimeOffset.UtcNow,
            };
            db.Runners.Add(existing);
        }
        else
        {
            existing.HardwareFingerprint = fingerprint;
            existing.MachineKey = machineKey;
            if (!string.IsNullOrWhiteSpace(req.Name))
                existing.Name = req.Name.Trim();
            if (!string.IsNullOrWhiteSpace(req.OsPlatform))
                existing.OsPlatform = req.OsPlatform.Trim();
            if (!string.IsNullOrWhiteSpace(req.AppVersion))
                existing.AppVersion = req.AppVersion.Trim();
            existing.IsActive = true;
            existing.LastSeenAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync(ct);

        return Result.Ok(new CheckInRunnerResponse(
            existing.Id,
            existing.MachineKey,
            existing.HardwareFingerprint ?? fingerprint,
            existing.IsActive
        ));
    }
}
