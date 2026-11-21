using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record AddToLibraryRequest(
    string MachineKey = "local-workstation"
);

public class AddTemplateToLibraryEndpoint(PipelineDbContext db)
    : Endpoint<AddToLibraryRequest, TemplateLibraryItemDto>
{
    public override void Configure()
    {
        Post("{templatePackageId:guid}/add-to-library");
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("Add a template package to personal workstation library"));
    }

    public override async Task HandleAsync(AddToLibraryRequest req, CancellationToken ct)
    {
        var templatePackageId = Route<Guid>("templatePackageId");
        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);
        var machineKey = string.IsNullOrWhiteSpace(req.MachineKey)
            ? "local-workstation"
            : req.MachineKey.Trim();

        var pkg = await db
            .TemplatePackages.AsNoTracking()
            .Include(t => t.PrimaryMasterVersion)
            .FirstOrDefaultAsync(t => t.Id == templatePackageId && t.IsPublic, ct);

        if (pkg is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var existing = await db
            .TemplateLibraryItems
            .FirstOrDefaultAsync(
                x =>
                    x.MachineKey == machineKey
                    && x.TemplatePackageId == templatePackageId
                    && x.PeriodKey == "lifetime",
                ct
            );

        if (existing is null)
        {
            existing = new TemplateLibraryItem
            {
                TemplatePackageId = templatePackageId,
                OwnerUserId = ownerUserId != Guid.Empty ? ownerUserId : null,
                MachineKey = machineKey,
                UsedRuns = 0,
                MaxRuns = pkg.DefaultQuotaLimit,
                PeriodKey = "lifetime",
                AddedAt = DateTimeOffset.UtcNow,
            };
            db.TemplateLibraryItems.Add(existing);
            await db.SaveChangesAsync(ct);
        }
        else if (!existing.MaxRuns.HasValue && pkg.DefaultQuotaLimit.HasValue)
        {
            existing.MaxRuns = pkg.DefaultQuotaLimit;
            await db.SaveChangesAsync(ct);
        }

        var remaining = existing.MaxRuns.HasValue
            ? Math.Max(0, existing.MaxRuns.Value - existing.UsedRuns)
            : (int?)null;

        await Send.OkAsync(
            new TemplateLibraryItemDto(
                existing.Id,
                pkg.Id,
                pkg.PrimaryMasterVersionId,
                pkg.Title,
                pkg.Description,
                pkg.Category,
                pkg.QuotaStrategy,
                existing.UsedRuns,
                existing.MaxRuns,
                remaining,
                existing.AddedAt,
                [],
                CloudTemplateClaimHelper.ExtractConstants(pkg.ContainerManifestJson)
            ),
            ct
        );
    }
}
