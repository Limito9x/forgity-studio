using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record TemplateConstantDeclarationDto(
    string Key,
    string Label,
    string DataType,
    string Scope,
    bool IsRequired,
    string? Description
);

public record TemplateAssetDto(
    string Name,
    string? RelativePath,
    string? BelongsToNodeId,
    string? BelongsToPinId,
    long? SizeBytes
);

public record CreateTemplateContainerRequest(
    Guid? TemplateId,
    string Title,
    string? Description,
    string? Category,
    int? DefaultQuotaLimit,
    List<Guid> MasterVersionIds,
    List<Guid> ComponentVersionIds,
    List<Guid> ScriptArtifactIds,
    List<TemplateConstantDeclarationDto> Constants,
    List<TemplateAssetDto> Assets,
    JsonDocument? PaletteNodesJson
);

public record CreateTemplateContainerResponse(
    Guid TemplatePackageId,
    string Title,
    int MasterCount,
    int ComponentCount,
    int ConstantCount,
    int AssetCount
);

public class CreateTemplateContainerEndpoint(PipelineDbContext db)
    : Endpoint<CreateTemplateContainerRequest, CreateTemplateContainerResponse>
{
    public override void Configure()
    {
        Post("containers");
        Group<TemplatesGroup>();
        Description(b => b
            .Produces<CreateTemplateContainerResponse>(200)
            .WithSummary("Slice 2: Package ingested Master, Components, Scripts, Constants & Assets into a Template Package Container"));
    }

    public override async Task HandleAsync(CreateTemplateContainerRequest req, CancellationToken ct)
    {
        Guid? primaryMasterVerId = req.MasterVersionIds.Count > 0 ? req.MasterVersionIds[0] : null;
        PipelineVersion? primaryMaster = null;

        if (primaryMasterVerId.HasValue)
        {
            primaryMaster = await db.PipelineVersions
                .Include(v => v.Pipeline)
                .FirstOrDefaultAsync(v => v.Id == primaryMasterVerId.Value, ct);
        }

        var manifestObj = new
        {
            masterVersionIds = req.MasterVersionIds,
            componentVersionIds = req.ComponentVersionIds,
            scriptArtifactIds = req.ScriptArtifactIds,
            constants = req.Constants,
            assets = req.Assets,
            paletteNodes = req.PaletteNodesJson?.RootElement
        };
        var manifestDoc = JsonDocument.Parse(JsonSerializer.Serialize(manifestObj));

        TemplatePackage? pkg = null;
        if (req.TemplateId.HasValue)
        {
            pkg = await db.TemplatePackages.FirstOrDefaultAsync(x => x.Id == req.TemplateId.Value, ct);
        }

        var resolvedTitle = !string.IsNullOrWhiteSpace(req.Title)
            ? req.Title.Trim()
            : (primaryMaster?.Pipeline?.Name ?? "Untitled Template Package");

        if (pkg is null)
        {
            pkg = new TemplatePackage
            {
                PrimaryMasterVersionId = primaryMaster?.Id,
                Title = resolvedTitle,
                Description = req.Description,
                Category = string.IsNullOrWhiteSpace(req.Category) ? "General" : req.Category.Trim(),
                IsPublic = true,
                QuotaStrategy = "PerComponentRun",
                DefaultQuotaLimit = req.DefaultQuotaLimit,
                ContainerManifestJson = manifestDoc
            };
            db.TemplatePackages.Add(pkg);
        }
        else
        {
            pkg.PrimaryMasterVersionId = primaryMaster?.Id;
            pkg.Title = resolvedTitle;
            pkg.Description = req.Description;
            pkg.Category = string.IsNullOrWhiteSpace(req.Category) ? "General" : req.Category.Trim();
            pkg.DefaultQuotaLimit = req.DefaultQuotaLimit;
            pkg.ContainerManifestJson = manifestDoc;
        }

        await db.SaveChangesAsync(ct);

        await Send.OkAsync(new CreateTemplateContainerResponse(
            pkg.Id,
            pkg.Title,
            req.MasterVersionIds.Count,
            req.ComponentVersionIds.Count,
            req.Constants.Count,
            req.Assets.Count
        ), ct);
    }
}
