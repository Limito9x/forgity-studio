using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public class GetMyLibraryItemEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<TemplateLibraryItemDto>
{
    public override void Configure()
    {
        Get("my-library/{libraryItemId:guid}");
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("Get a specific template item from user library"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var libraryItemId = Route<Guid>("libraryItemId");
        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);

        var x = await db
            .TemplateLibraryItems.AsNoTracking()
            .Include(i => i.ConstantProfile)
            .Include(i => i.TemplatePackage)
                .ThenInclude(t => t.PrimaryMasterVersion)
            .FirstOrDefaultAsync(i => i.Id == libraryItemId && i.OwnerUserId == ownerUserId, ct);

        if (x is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var remaining = x.MaxRuns.HasValue ? Math.Max(0, x.MaxRuns.Value - x.UsedRuns) : (int?)null;

        await Send.OkAsync(
            new TemplateLibraryItemDto(
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
                x.MaxRuns,
                remaining,
                x.AddedAt,
                x.TemplatePackage.PrimaryMasterVersion?.ContractsJson,
                CloudTemplateClaimHelper.ExtractRootPipeline(
                    x.TemplatePackage.PrimaryMasterVersion
                ),
                x.TemplatePackage.ContainerManifestJson
            ),
            ct
        );
    }
}
