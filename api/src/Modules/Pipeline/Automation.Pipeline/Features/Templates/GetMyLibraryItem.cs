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
                m.SortOrder,
                null,
                m.PipelineVersion.DagBundleJson,
                m.QuotaMode,
                m.QuotaCost
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
                0,
                null,
                x.TemplatePackage.PrimaryMasterVersion.DagBundleJson
            ));
        }

        var effectiveMaxRuns = x.MaxRuns ?? x.TemplatePackage.DefaultQuotaLimit;
        var remaining = effectiveMaxRuns.HasValue ? Math.Max(0, effectiveMaxRuns.Value - x.UsedRuns) : (int?)null;

        await Send.OkAsync(
            new TemplateLibraryItemDto(
                x.Id,
                x.TemplatePackageId,
                x.TemplatePackage.PrimaryMasterVersionId,
                x.TemplatePackage.Title,
                x.TemplatePackage.Description,
                x.TemplatePackage.Category,
                x.TemplatePackage.QuotaStrategy,
                x.UsedRuns,
                effectiveMaxRuns,
                remaining,
                x.AddedAt,
                members,
                CloudTemplateClaimHelper.ExtractConstants(x.TemplatePackage.ContainerManifestJson),
                CloudTemplateClaimHelper.ExtractPaletteNodes(x.TemplatePackage.ContainerManifestJson)
            ),
            ct
        );
    }
}
