using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public class GetCloudTemplatesEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<List<CloudTemplateSummaryDto>>
{
    public override void Configure()
    {
        Get("");
        Group<TemplatesGroup>();
        Description(b =>
            b.WithSummary("List all public template packages with user library & quota status")
        );
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var requestedMachineKey = Query<string>("machineKey", isRequired: false);

        var templates = await db
            .TemplatePackages.AsNoTracking()
            .Include(t => t.PrimaryMasterVersion)
            .Where(t => t.IsPublic && t.ArchivedAt == null)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(ct);

        var allLibraryItems = await db
            .TemplateLibraryItems.AsNoTracking()
            .Where(q => q.PeriodKey == "lifetime")
            .OrderByDescending(q => q.AddedAt)
            .ToListAsync(ct);

        var statsByTemplate = allLibraryItems
            .GroupBy(q => q.TemplatePackageId)
            .ToDictionary(
                g => g.Key,
                g => (ForkCount: g.Count(), TotalGlobalRuns: g.Sum(x => x.UsedRuns))
            );

        var filteredItems = string.IsNullOrWhiteSpace(requestedMachineKey)
            ? allLibraryItems
            : allLibraryItems
                .Where(q => q.MachineKey == requestedMachineKey.Trim())
                .ToList();

        var libraryItems = filteredItems
            .GroupBy(q => q.TemplatePackageId)
            .ToDictionary(g => g.Key, g => g.First());

        var result = templates
            .Select(t =>
            {
                libraryItems.TryGetValue(t.Id, out var libItem);
                statsByTemplate.TryGetValue(t.Id, out var stats);
                var used = libItem?.UsedRuns ?? 0;
                int? max = libItem is not null ? libItem.MaxRuns : t.DefaultQuotaLimit;
                int? remaining = max.HasValue ? Math.Max(0, max.Value - used) : null;

                return new CloudTemplateSummaryDto(
                    t.Id,
                    t.PrimaryMasterVersionId,
                    t.Title,
                    t.Description,
                    t.Category,
                    t.QuotaStrategy,
                    t.DefaultQuotaLimit,
                    remaining,
                    used,
                    libItem is not null,
                    libItem?.Id,
                    t.VersionNumber,
                    stats.ForkCount,
                    stats.TotalGlobalRuns
                );
            })
            .ToList();

        await Send.OkAsync(result, ct);
    }
}
