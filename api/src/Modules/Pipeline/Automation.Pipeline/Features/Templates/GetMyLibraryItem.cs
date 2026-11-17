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
            .Include(i => i.TemplatePackage)
                .ThenInclude(t => t.Members)
                    .ThenInclude(m => m.PipelineVersion)
            .FirstOrDefaultAsync(i => i.Id == libraryItemId && i.OwnerUserId == ownerUserId, ct);

        if (x is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var members = x.TemplatePackage.Members
            .OrderBy(m => m.SortOrder)
            .Select(m => new TemplateContainerMemberDto(
                m.PipelineVersionId,
                m.PipelineVersion.Slug,
                m.PipelineVersion.PipelineKind,
                m.PipelineVersion.VersionNumber,
                m.PipelineVersion.GraphHash,
                m.Role,
                m.SortOrder
            ))
            .ToList();

        if (members.Count == 0 && x.TemplatePackage.PrimaryMasterVersion is not null)
        {
            members.Add(new TemplateContainerMemberDto(
                x.TemplatePackage.PrimaryMasterVersion.Id,
                x.TemplatePackage.PrimaryMasterVersion.Slug,
                x.TemplatePackage.PrimaryMasterVersion.PipelineKind,
                x.TemplatePackage.PrimaryMasterVersion.VersionNumber,
                x.TemplatePackage.PrimaryMasterVersion.GraphHash,
                "master",
                0
            ));
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
                members,
                CloudTemplateClaimHelper.ExtractConstants(x.TemplatePackage.ContainerManifestJson)
            ),
            ct
        );
    }
}
