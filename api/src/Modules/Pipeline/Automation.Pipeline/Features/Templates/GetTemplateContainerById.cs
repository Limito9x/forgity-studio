using System.Text.Json;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record TemplateContainerMemberDto(
    Guid PipelineVersionId,
    string Slug,
    string PipelineKind,
    int VersionNumber,
    string GraphHash,
    string Role,
    int SortOrder
);

public record TemplateContainerDetailDto(
    Guid TemplatePackageId,
    string Title,
    string? Description,
    string Category,
    int VersionNumber,
    Guid? SupersedesId,
    DateTimeOffset? ArchivedAt,
    long TotalAssetBytes,
    int? DefaultQuotaLimit,
    Guid? PrimaryMasterVersionId,
    List<TemplateContainerMemberDto> Members,
    List<TemplateConstantDeclarationDto> Constants,
    JsonDocument ContainerManifestJson,
    DateTimeOffset CreatedAt
);

public class GetTemplateContainerByIdEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<TemplateContainerDetailDto>
{
    public override void Configure()
    {
        Get("containers/{id:guid}");
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("Get Template Package Container details including relational members and manifest"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");

        var pkg = await db.TemplatePackages
            .AsNoTracking()
            .Include(p => p.PrimaryMasterVersion)
            .Include(p => p.Members)
                .ThenInclude(m => m.PipelineVersion)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        if (pkg is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var members = pkg.Members
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

        if (members.Count == 0 && pkg.PrimaryMasterVersion is not null)
        {
            members.Add(new TemplateContainerMemberDto(
                pkg.PrimaryMasterVersion.Id,
                pkg.PrimaryMasterVersion.Slug,
                pkg.PrimaryMasterVersion.PipelineKind,
                pkg.PrimaryMasterVersion.VersionNumber,
                pkg.PrimaryMasterVersion.GraphHash,
                "master",
                0
            ));
        }

        var constants = CloudTemplateClaimHelper.ExtractConstants(pkg.ContainerManifestJson);

        await Send.OkAsync(new TemplateContainerDetailDto(
            pkg.Id,
            pkg.Title,
            pkg.Description,
            pkg.Category,
            pkg.VersionNumber,
            pkg.SupersedesId,
            pkg.ArchivedAt,
            pkg.TotalAssetBytes,
            pkg.DefaultQuotaLimit,
            pkg.PrimaryMasterVersionId,
            members,
            constants,
            pkg.ContainerManifestJson,
            pkg.CreatedAt
        ), ct);
    }
}
