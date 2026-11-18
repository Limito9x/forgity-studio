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
    string? Description,
    string? DefaultValue = null
);

public record TemplateAssetDto(
    string Name,
    string? RelativePath,
    string? BelongsToNodeId,
    string? BelongsToPinId,
    long? SizeBytes,
    string? AssetId = null,
    string? DownloadUrl = null,
    string? Sha256 = null
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
    JsonDocument? PaletteNodesJson,
    string? Slug = null
);

public record CreateTemplateContainerResponse(
    Guid TemplatePackageId,
    string Title,
    string Slug,
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
        var allRequestedVersionIds = req.MasterVersionIds
            .Concat(req.ComponentVersionIds)
            .Distinct()
            .ToList();

        var existingVersions = await db.PipelineVersions
            .Include(v => v.Pipeline)
            .Where(v => allRequestedVersionIds.Contains(v.Id))
            .ToDictionaryAsync(v => v.Id, ct);

        var missingIds = allRequestedVersionIds
            .Where(id => !existingVersions.ContainsKey(id))
            .ToList();

        if (missingIds.Count > 0)
        {
            ThrowError($"Invalid PipelineVersionIds: {string.Join(", ", missingIds)}");
        }

        Guid? primaryMasterVerId = req.MasterVersionIds.Count > 0 ? req.MasterVersionIds[0] : null;
        PipelineVersion? primaryMaster = primaryMasterVerId.HasValue
            ? existingVersions.GetValueOrDefault(primaryMasterVerId.Value)
            : null;

        var totalAssetBytes = req.Assets.Sum(a => a.SizeBytes ?? 0);

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
            pkg = await db.TemplatePackages
                .Include(x => x.Members)
                .FirstOrDefaultAsync(x => x.Id == req.TemplateId.Value, ct);
        }

        var resolvedTitle = !string.IsNullOrWhiteSpace(req.Title)
            ? req.Title.Trim()
            : (primaryMaster?.Pipeline?.Name ?? "Untitled Template Package");

        static string Slugify(string raw)
        {
            var s = System.Text.RegularExpressions.Regex.Replace(
                raw.Trim().ToLowerInvariant(),
                @"[^a-z0-9]+",
                "-"
            ).Trim('-');
            return string.IsNullOrEmpty(s) ? "template" : s;
        }

        if (pkg is null)
        {
            var baseSlug = Slugify(!string.IsNullOrWhiteSpace(req.Slug) ? req.Slug : resolvedTitle);
            var candidateSlug = baseSlug;
            int suffix = 2;
            while (await db.TemplatePackages.AnyAsync(t => t.Slug == candidateSlug, ct))
            {
                candidateSlug = $"{baseSlug}-{suffix++}";
            }

            pkg = new TemplatePackage
            {
                PrimaryMasterVersionId = primaryMaster?.Id,
                Title = resolvedTitle,
                Slug = candidateSlug,
                Description = req.Description,
                Category = string.IsNullOrWhiteSpace(req.Category) ? "General" : req.Category.Trim(),
                IsPublic = true,
                QuotaStrategy = "PerComponentRun",
                DefaultQuotaLimit = req.DefaultQuotaLimit,
                VersionNumber = 1,
                TotalAssetBytes = totalAssetBytes,
                ContainerManifestJson = manifestDoc
            };
            db.TemplatePackages.Add(pkg);
        }
        else
        {
            pkg.PrimaryMasterVersionId = primaryMaster?.Id;
            pkg.Title = resolvedTitle;
            if (string.IsNullOrWhiteSpace(pkg.Slug))
            {
                pkg.Slug = Slugify(!string.IsNullOrWhiteSpace(req.Slug) ? req.Slug : resolvedTitle);
            }
            pkg.Description = req.Description;
            pkg.Category = string.IsNullOrWhiteSpace(req.Category) ? "General" : req.Category.Trim();
            pkg.DefaultQuotaLimit = req.DefaultQuotaLimit;
            pkg.TotalAssetBytes = totalAssetBytes;
            pkg.ContainerManifestJson = manifestDoc;
            db.TemplatePackageMembers.RemoveRange(pkg.Members);
            pkg.Members.Clear();
        }

        int sortOrder = 0;
        var addedVersionIds = new HashSet<Guid>();
        foreach (var masterId in req.MasterVersionIds)
        {
            if (addedVersionIds.Add(masterId))
            {
                pkg.Members.Add(new TemplatePackageMember
                {
                    TemplatePackage = pkg,
                    PipelineVersionId = masterId,
                    Role = "master",
                    SortOrder = sortOrder++
                });
            }
        }

        foreach (var compId in req.ComponentVersionIds)
        {
            if (addedVersionIds.Add(compId))
            {
                pkg.Members.Add(new TemplatePackageMember
                {
                    TemplatePackage = pkg,
                    PipelineVersionId = compId,
                    Role = "component",
                    SortOrder = sortOrder++
                });
            }
        }

        await db.SaveChangesAsync(ct);

        await Send.OkAsync(new CreateTemplateContainerResponse(
            pkg.Id,
            pkg.Title,
            pkg.Slug,
            req.MasterVersionIds.Count,
            req.ComponentVersionIds.Count,
            req.Constants.Count,
            req.Assets.Count
        ), ct);
    }
}
