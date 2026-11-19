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
        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);

        var templates = await db
            .TemplatePackages.AsNoTracking()
            .Include(t => t.PrimaryMasterVersion)
            .Where(t => t.IsPublic)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(ct);

        var rawLibraryItems = await db
            .TemplateLibraryItems.AsNoTracking()
            .Where(q =>
                q.OwnerUserId == ownerUserId
                && q.PeriodKey == "lifetime"
                && (string.IsNullOrWhiteSpace(requestedMachineKey) || q.MachineKey == requestedMachineKey)
            )
            .OrderByDescending(q => q.AddedAt)
            .ToListAsync(ct);

        var libraryItems = rawLibraryItems
            .GroupBy(q => q.TemplatePackageId)
            .ToDictionary(g => g.Key, g => g.First());

        var result = templates
            .Select(t =>
            {
                libraryItems.TryGetValue(t.Id, out var libItem);
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
                    t.VersionNumber
                );
            })
            .ToList();

        await Send.OkAsync(result, ct);
    }
}
