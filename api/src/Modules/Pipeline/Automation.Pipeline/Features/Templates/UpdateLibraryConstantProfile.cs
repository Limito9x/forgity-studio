using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record UpdateLibraryConstantProfileRequest(Guid? ConstantProfileId);

public class UpdateLibraryConstantProfileEndpoint(PipelineDbContext db)
    : Endpoint<UpdateLibraryConstantProfileRequest, TemplateLibraryItemDto>
{
    public override void Configure()
    {
        Patch("my-library/{libraryItemId:guid}/constant-profile");
        Group<TemplatesGroup>();
        Description(b =>
            b.WithSummary("Bind or unbind a ConstantProfile to a Library template item")
        );
    }

    public override async Task HandleAsync(
        UpdateLibraryConstantProfileRequest req,
        CancellationToken ct
    )
    {
        var libraryItemId = Route<Guid>("libraryItemId");
        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);

        var item = await db
            .TemplateLibraryItems.Include(i => i.TemplatePackage)
                .ThenInclude(t => t.PrimaryMasterVersion)
            .FirstOrDefaultAsync(i => i.Id == libraryItemId && i.OwnerUserId == ownerUserId, ct);

        if (item is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        if (req.ConstantProfileId.HasValue)
        {
            var profileExists = await db.ConstantProfiles.AnyAsync(
                c =>
                    c.Id == req.ConstantProfileId.Value
                    && (ownerUserId == Guid.Empty || c.OwnerUserId == ownerUserId),
                ct
            );
            if (!profileExists)
            {
                await Send.NotFoundAsync(ct);
                return;
            }
        }

        item.ConstantProfileId = req.ConstantProfileId;
        await db.SaveChangesAsync(ct);
        await db.Entry(item).Reference(i => i.ConstantProfile).LoadAsync(ct);

        var remaining = item.MaxRuns.HasValue
            ? Math.Max(0, item.MaxRuns.Value - item.UsedRuns)
            : (int?)null;

        await Send.OkAsync(
            new TemplateLibraryItemDto(
                item.Id,
                item.TemplatePackageId,
                item.TemplatePackage.PrimaryMasterVersionId,
                item.TemplatePackage.Title,
                item.TemplatePackage.Description,
                item.TemplatePackage.Category,
                item.TemplatePackage.QuotaStrategy,
                item.ConstantProfileId,
                item.ConstantProfile?.Name,
                item.UsedRuns,
                item.MaxRuns,
                remaining,
                item.AddedAt,
                item.TemplatePackage.PrimaryMasterVersion?.ContractsJson,
                CloudTemplateClaimHelper.ExtractRootPipeline(
                    item.TemplatePackage.PrimaryMasterVersion
                ),
                item.TemplatePackage.ContainerManifestJson
            ),
            ct
        );
    }
}
