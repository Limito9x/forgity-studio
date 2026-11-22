using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Runner.Contracts;
using FluentResults;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public enum QuotaAdjustmentAction
{
    AddCredits = 0,
    SetLimit = 1,
    SetUnlimited = 2,
    ResetUsage = 3,
    Revoke = 4,
    Restore = 5,
}

public record AdjustTemplateQuotaCommand(
    Guid LibraryItemId,
    QuotaAdjustmentAction Action,
    int? Amount = null
);

public record TemplateInstallationQuotaDto(
    Guid LibraryItemId,
    Guid TemplatePackageId,
    string TemplateTitle,
    Guid? OwnerUserId,
    string? OwnerEmail,
    string MachineKey,
    string? MachineName,
    string? OsPlatform,
    string? AppVersion,
    DateTimeOffset? RunnerLastSeenAt,
    int UsedRuns,
    int? MaxRuns,
    int? RemainingRuns,
    string QuotaStrategy,
    bool IsRevoked,
    DateTimeOffset AddedAt,
    DateTimeOffset? LastRunAt,
    string Status
);

public interface ITemplateQuotaService
{
    Task<Result<TemplateInstallationQuotaDto>> AdjustQuotaAsync(
        AdjustTemplateQuotaCommand command,
        CancellationToken ct = default
    );
}

public class TemplateQuotaService(PipelineDbContext db, IRunnerApi runnerApi)
    : ITemplateQuotaService
{
    public static string ResolveStatus(TemplateLibraryItem item)
    {
        if (item.IsRevoked)
            return "Revoked";
        if (!item.MaxRuns.HasValue)
            return "Unlimited";
        return item.UsedRuns >= item.MaxRuns.Value ? "Exhausted" : "Active";
    }

    public async Task<Result<TemplateInstallationQuotaDto>> AdjustQuotaAsync(
        AdjustTemplateQuotaCommand command,
        CancellationToken ct = default
    )
    {
        var item = await db
            .TemplateLibraryItems.Include(x => x.TemplatePackage)
            .FirstOrDefaultAsync(x => x.Id == command.LibraryItemId, ct);

        if (item is null)
        {
            return Result.Fail($"Template installation '{command.LibraryItemId}' not found.");
        }

        switch (command.Action)
        {
            case QuotaAdjustmentAction.AddCredits:
                var delta = Math.Max(1, command.Amount ?? 0);
                item.MaxRuns = (item.MaxRuns ?? item.UsedRuns) + delta;
                item.IsRevoked = false;
                break;

            case QuotaAdjustmentAction.SetLimit:
                item.MaxRuns = Math.Max(0, command.Amount ?? 0);
                break;

            case QuotaAdjustmentAction.SetUnlimited:
                item.MaxRuns = null;
                item.IsRevoked = false;
                break;

            case QuotaAdjustmentAction.ResetUsage:
                item.UsedRuns = 0;
                break;

            case QuotaAdjustmentAction.Revoke:
                item.IsRevoked = true;
                break;

            case QuotaAdjustmentAction.Restore:
                item.IsRevoked = false;
                break;

            default:
                return Result.Fail($"Unsupported quota action '{command.Action}'.");
        }

        await db.SaveChangesAsync(ct);

        var runnersResult = await runnerApi.GetRunnersMapByMachineKeysAsync(
            [item.MachineKey],
            ct
        );
        RunnerDto? runner = null;
        if (runnersResult.IsSuccess)
        {
            runnersResult.Value.TryGetValue(item.MachineKey, out runner);
        }

        return Result.Ok(MapToDto(item, runner));
    }

    public static TemplateInstallationQuotaDto MapToDto(
        TemplateLibraryItem item,
        RunnerDto? runner
    )
    {
        int? remaining = item.MaxRuns.HasValue
            ? Math.Max(0, item.MaxRuns.Value - item.UsedRuns)
            : null;

        return new TemplateInstallationQuotaDto(
            item.Id,
            item.TemplatePackageId,
            item.TemplatePackage?.Title ?? "Unknown Template",
            item.OwnerUserId,
            item.OwnerEmail,
            item.MachineKey,
            runner?.Name,
            runner?.OsPlatform,
            runner?.AppVersion,
            runner?.LastSeenAt,
            item.UsedRuns,
            item.MaxRuns,
            remaining,
            item.TemplatePackage?.QuotaStrategy ?? "PerComponentRun",
            item.IsRevoked,
            item.AddedAt,
            item.LastRunAt,
            ResolveStatus(item)
        );
    }
}
