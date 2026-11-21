using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record PublishTemplateContainerResponse(
    Guid NewTemplatePackageId,
    Guid PreviousTemplatePackageId,
    int VersionNumber,
    string Title
);

public class PublishTemplateContainerEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<PublishTemplateContainerResponse>
{
    public override void Configure()
    {
        Post("containers/{id:guid}/publish");
        Group<TemplatesGroup>();
        Permissions(Constants.PipelinePermissions.Pipeline.Update);
        Description(b => b.WithSummary("Publish a new immutable version of a Template Package Container and archive the previous version"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");

        var oldPkg = await db.TemplatePackages
            .Include(p => p.Members)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        if (oldPkg is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var now = DateTimeOffset.UtcNow;
        oldPkg.ArchivedAt = now;
        oldPkg.IsPublic = false;

        var newPkg = new TemplatePackage
        {
            Title = oldPkg.Title,
            Description = oldPkg.Description,
            Category = oldPkg.Category,
            IsPublic = true,
            QuotaStrategy = oldPkg.QuotaStrategy,
            DefaultQuotaLimit = oldPkg.DefaultQuotaLimit,
            VersionNumber = oldPkg.VersionNumber + 1,
            SupersedesId = oldPkg.Id,
            ArchivedAt = null,
            TotalAssetBytes = oldPkg.TotalAssetBytes,
            PrimaryMasterVersionId = oldPkg.PrimaryMasterVersionId,
            ContainerManifestJson = JsonDocument.Parse(oldPkg.ContainerManifestJson.RootElement.GetRawText()),
        };

        foreach (var member in oldPkg.Members)
        {
            newPkg.Members.Add(new TemplatePackageMember
            {
                TemplatePackage = newPkg,
                PipelineVersionId = member.PipelineVersionId,
                Role = member.Role,
                SortOrder = member.SortOrder,
                QuotaMode = member.QuotaMode,
                QuotaCost = member.QuotaCost,
            });
        }

        db.TemplatePackages.Add(newPkg);
        await db.SaveChangesAsync(ct);

        await Send.OkAsync(new PublishTemplateContainerResponse(
            newPkg.Id,
            oldPkg.Id,
            newPkg.VersionNumber,
            newPkg.Title
        ), ct);
    }
}
