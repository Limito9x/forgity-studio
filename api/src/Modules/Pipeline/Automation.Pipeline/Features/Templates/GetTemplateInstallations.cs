using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Runner.Contracts;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record GetTemplateInstallationsRequest
{
    [QueryParam]
    public Guid? TemplatePackageId { get; init; }

    [QueryParam]
    public string? MachineKey { get; init; }

    [QueryParam]
    public Guid? OwnerUserId { get; init; }

    [QueryParam]
    public string? Status { get; init; }
}

public class GetTemplateInstallationsEndpoint(PipelineDbContext db, IRunnerApi runnerApi)
    : Endpoint<GetTemplateInstallationsRequest, List<TemplateInstallationQuotaDto>>
{
    public override void Configure()
    {
        Get("installations");
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("Admin: list workstation template installations and quota usage"));
    }

    public override async Task HandleAsync(GetTemplateInstallationsRequest req, CancellationToken ct)
    {
        var query = db
            .TemplateLibraryItems.AsNoTracking()
            .Include(x => x.TemplatePackage)
            .AsQueryable();

        if (req.TemplatePackageId.HasValue && req.TemplatePackageId.Value != Guid.Empty)
        {
            query = query.Where(x => x.TemplatePackageId == req.TemplatePackageId.Value);
        }

        if (!string.IsNullOrWhiteSpace(req.MachineKey))
        {
            var mk = req.MachineKey.Trim();
            query = query.Where(x => x.MachineKey.Contains(mk));
        }

        if (req.OwnerUserId.HasValue && req.OwnerUserId.Value != Guid.Empty)
        {
            query = query.Where(x => x.OwnerUserId == req.OwnerUserId.Value);
        }

        var items = await query
            .OrderByDescending(x => x.LastRunAt ?? x.AddedAt)
            .ToListAsync(ct);

        var machineKeys = items.Select(x => x.MachineKey).Distinct().ToList();
        var runnersResult = await runnerApi.GetRunnersMapByMachineKeysAsync(machineKeys, ct);
        var runnerMap = runnersResult.IsSuccess
            ? runnersResult.Value
            : new Dictionary<string, RunnerDto>(StringComparer.OrdinalIgnoreCase);

        var dtos = items
            .Select(item =>
            {
                runnerMap.TryGetValue(item.MachineKey, out var runner);
                return TemplateQuotaService.MapToDto(item, runner);
            })
            .Where(dto =>
                string.IsNullOrWhiteSpace(req.Status)
                || string.Equals(dto.Status, req.Status.Trim(), StringComparison.OrdinalIgnoreCase)
            )
            .ToList();

        await Send.OkAsync(dtos, ct);
    }
}
