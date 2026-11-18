using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public class GetMyLibraryEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<List<TemplateLibraryItemDto>>
{
    public override void Configure()
    {
        Get("my-library");
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("List all subscribed templates in user's library"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);
        var machineKey = Query<string>("machineKey", isRequired: false);

        var query = db
            .TemplateLibraryItems.AsNoTracking()
            .Include(x => x.ConstantProfile)
            .Include(x => x.TemplatePackage)
                .ThenInclude(t => t.PrimaryMasterVersion)
            .Where(x => x.OwnerUserId == ownerUserId && x.PeriodKey == "lifetime");

        if (!string.IsNullOrWhiteSpace(machineKey))
        {
            query = query.Where(x => x.MachineKey == machineKey);
        }

        var items = await query.OrderByDescending(x => x.AddedAt).ToListAsync(ct);

        var result = items
            .Select(x =>
            {
                var effectiveMaxRuns = x.MaxRuns ?? x.TemplatePackage.DefaultQuotaLimit;
                var remaining = effectiveMaxRuns.HasValue
                    ? Math.Max(0, effectiveMaxRuns.Value - x.UsedRuns)
                    : (int?)null;
                return new TemplateLibraryItemDto(
                    x.Id,
                    x.TemplatePackageId,
                    x.TemplatePackage.PrimaryMasterVersionId,
                    x.TemplatePackage.Title,
                    x.TemplatePackage.Description,
                    x.TemplatePackage.Category,
                    x.TemplatePackage.QuotaStrategy,
                    x.ConstantProfileId,
                    x.ConstantProfile?.Name,
                    x.UsedRuns,
                    effectiveMaxRuns,
                    remaining,
                    x.AddedAt,
                    [],
                    []
                );
            })
            .ToList();

        await Send.OkAsync(result, ct);
    }
}
