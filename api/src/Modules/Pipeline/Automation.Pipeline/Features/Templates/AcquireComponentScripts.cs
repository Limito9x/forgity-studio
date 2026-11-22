using System.Text.Json;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record AcquireComponentScriptsRequest(
    Guid TemplatePackageId,
    Guid? PipelineVersionId,
    string MachineKey,
    List<string> ScriptHashes,
    int UnitCount = 1,
    List<string>? AlreadyCachedHashes = null,
    string? ComponentSlug = null
);

public record AcquiredScriptItemDto(
    string ScriptHash,
    string Key,
    string Executor,
    string SourceCode,
    JsonDocument RequirementsJson
);

public record AcquireComponentScriptsResponse(
    bool Allowed,
    int? RemainingQuota,
    List<AcquiredScriptItemDto> Scripts
);

public class AcquireComponentScriptsEndpoint(PipelineDbContext db)
    : Endpoint<AcquireComponentScriptsRequest, AcquireComponentScriptsResponse>
{
    public override void Configure()
    {
        Post("acquire-component-scripts");
        AllowAnonymous();
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("Pre-flight quota verification and secure script download for a template component"));
    }

    public override async Task HandleAsync(AcquireComponentScriptsRequest req, CancellationToken ct)
    {
        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);
        var ownerEmail = CloudTemplateClaimHelper.GetOwnerEmail(User);

        // 1. Verify TemplatePackage existence
        var template = await db.TemplatePackages
            .AsNoTracking()
            .Include(t => t.Members)
                .ThenInclude(m => m.PipelineVersion)
                    .ThenInclude(v => v.VersionScripts)
                        .ThenInclude(vs => vs.PipelineScript)
            .FirstOrDefaultAsync(t => t.Id == req.TemplatePackageId, ct);

        if (template is null)
        {
            HttpContext.Response.StatusCode = 404;
            await HttpResponseJsonExtensions.WriteAsJsonAsync(
                HttpContext.Response,
                new { error = "TEMPLATE_NOT_FOUND", message = "Template package not found." },
                ct
            );
            return;
        }

        // 2. Collect valid script hashes from TemplatePackage members & manifest
        var validScriptsByHash = new Dictionary<string, Domain.Entities.PipelineScript>(StringComparer.OrdinalIgnoreCase);

        foreach (var member in template.Members)
        {
            foreach (var vs in member.PipelineVersion.VersionScripts)
            {
                if (!string.IsNullOrWhiteSpace(vs.PipelineScript.ScriptHash))
                {
                    validScriptsByHash[vs.PipelineScript.ScriptHash] = vs.PipelineScript;
                }
            }
        }

        // If manifest contains scriptArtifactIds, also load them
        if (template.ContainerManifestJson.RootElement.TryGetProperty("scriptArtifactIds", out var artifactsEl) &&
            artifactsEl.ValueKind == JsonValueKind.Array)
        {
            var artifactIds = new List<Guid>();
            foreach (var el in artifactsEl.EnumerateArray())
            {
                if (el.TryGetGuid(out var g))
                {
                    artifactIds.Add(g);
                }
            }
            if (artifactIds.Count > 0)
            {
                var manifestScripts = await db.PipelineScripts
                    .AsNoTracking()
                    .Where(s => artifactIds.Contains(s.Id))
                    .ToListAsync(ct);
                foreach (var ms in manifestScripts)
                {
                    if (!string.IsNullOrWhiteSpace(ms.ScriptHash))
                    {
                        validScriptsByHash[ms.ScriptHash] = ms;
                    }
                }
            }
        }

        // Verify that requested hashes actually belong to this Template
        var requestedHashes = req.ScriptHashes
            .Where(h => !string.IsNullOrWhiteSpace(h))
            .Select(h => h.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var hash in requestedHashes)
        {
            if (!validScriptsByHash.ContainsKey(hash))
            {
                // Fallback: check if script exists globally in PipelineScripts
                var globalScript = await db.PipelineScripts
                    .AsNoTracking()
                    .FirstOrDefaultAsync(s => s.ScriptHash == hash, ct);
                if (globalScript != null)
                {
                    validScriptsByHash[hash] = globalScript;
                }
                else
                {
                    HttpContext.Response.StatusCode = 400;
                    await HttpResponseJsonExtensions.WriteAsJsonAsync(
                        HttpContext.Response,
                        new
                        {
                            error = "SCRIPT_HASH_NOT_IN_TEMPLATE",
                            message = $"Script hash '{hash}' does not belong to template '{template.Title}'."
                        },
                        ct
                    );
                    return;
                }
            }
        }

        // 3. Verify machine-first ownership & quota in TemplateLibraryItems (auto-provision with DefaultQuotaLimit if forked directly)
        var effectiveMachineKey = string.IsNullOrWhiteSpace(req.MachineKey)
            ? "local-workstation"
            : req.MachineKey.Trim();

        var libraryItem = await db.TemplateLibraryItems.FirstOrDefaultAsync(
            q => q.TemplatePackageId == req.TemplatePackageId
                 && q.MachineKey == effectiveMachineKey
                 && q.PeriodKey == "lifetime",
            ct
        );

        if (libraryItem is null)
        {
            libraryItem = new Domain.Entities.TemplateLibraryItem
            {
                TemplatePackageId = req.TemplatePackageId,
                OwnerUserId = ownerUserId != Guid.Empty ? ownerUserId : null,
                OwnerEmail = ownerEmail,
                MachineKey = effectiveMachineKey,
                UsedRuns = 0,
                MaxRuns = template.DefaultQuotaLimit,
                PeriodKey = "lifetime",
                AddedAt = DateTimeOffset.UtcNow,
            };
            db.TemplateLibraryItems.Add(libraryItem);
            await db.SaveChangesAsync(ct);
        }
        else
        {
            var dirty = false;
            if (!libraryItem.MaxRuns.HasValue && template.DefaultQuotaLimit.HasValue)
            {
                libraryItem.MaxRuns = template.DefaultQuotaLimit;
                dirty = true;
            }
            if (ownerUserId != Guid.Empty && libraryItem.OwnerUserId != ownerUserId)
            {
                libraryItem.OwnerUserId = ownerUserId;
                dirty = true;
            }
            if (!string.IsNullOrWhiteSpace(ownerEmail) && libraryItem.OwnerEmail != ownerEmail)
            {
                libraryItem.OwnerEmail = ownerEmail;
                dirty = true;
            }
            if (dirty)
            {
                await db.SaveChangesAsync(ct);
            }
        }

        if (libraryItem.IsRevoked)
        {
            HttpContext.Response.StatusCode = 403;
            await HttpResponseJsonExtensions.WriteAsJsonAsync(
                HttpContext.Response,
                new { error = "TEMPLATE_ACCESS_REVOKED", message = "Template access has been revoked for this workstation." },
                ct
            );
            return;
        }

        // 4. Resolve per-member quota policy (match ComponentSlug FIRST, then ScriptHash, then PipelineVersionId)
        var normalizedSlug = req.ComponentSlug?.Trim().Replace("-", "_");
        var targetMember =
            (!string.IsNullOrWhiteSpace(normalizedSlug)
                ? template.Members.FirstOrDefault(m =>
                    string.Equals(
                        m.PipelineVersion.Slug.Replace("-", "_"),
                        normalizedSlug,
                        StringComparison.OrdinalIgnoreCase))
                : null)
            ?? template.Members.FirstOrDefault(m =>
                string.Equals(m.Role, "component", StringComparison.OrdinalIgnoreCase)
                && m.PipelineVersion.VersionScripts.Any(vs =>
                    !string.IsNullOrWhiteSpace(vs.PipelineScript.ScriptHash)
                    && requestedHashes.Contains(vs.PipelineScript.ScriptHash, StringComparer.OrdinalIgnoreCase)))
            ?? (req.PipelineVersionId.HasValue
                ? template.Members.FirstOrDefault(m => m.PipelineVersionId == req.PipelineVersionId.Value)
                : null);

        int effectiveUnits = req.UnitCount;
        if (targetMember is not null)
        {
            effectiveUnits = targetMember.QuotaMode switch
            {
                "None" => 0,
                "PerRun" => req.UnitCount > 0 ? Math.Max(0, targetMember.QuotaCost) : 0,
                _ => Math.Max(0, req.UnitCount) * Math.Max(0, targetMember.QuotaCost),
            };
        }

        int? remainingQuota = null;
        if (effectiveUnits > 0)
        {
            if (libraryItem.MaxRuns.HasValue)
            {
                var rows = await db.Database.ExecuteSqlInterpolatedAsync(
                    $@"
                    UPDATE pipeline.""TemplateLibraryItems""
                    SET ""UsedRuns"" = ""UsedRuns"" + {effectiveUnits}, ""LastRunAt"" = NOW()
                    WHERE ""Id"" = {libraryItem.Id} AND ""IsRevoked"" = FALSE AND ""UsedRuns"" + {effectiveUnits} <= ""MaxRuns""
                    ",
                    ct
                );

                if (rows == 0)
                {
                    HttpContext.Response.StatusCode = 402;
                    await HttpResponseJsonExtensions.WriteAsJsonAsync(
                        HttpContext.Response,
                        new
                        {
                            error = "QUOTA_EXHAUSTED",
                            message = "Template quota exhausted."
                        },
                        ct
                    );
                    return;
                }

                await db.Entry(libraryItem).ReloadAsync(ct);
                remainingQuota = Math.Max(0, libraryItem.MaxRuns.Value - libraryItem.UsedRuns);
            }
            else
            {
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $@"
                    UPDATE pipeline.""TemplateLibraryItems""
                    SET ""UsedRuns"" = ""UsedRuns"" + {effectiveUnits}
                    WHERE ""Id"" = {libraryItem.Id}
                    ",
                    ct
                );
            }
        }

        // 5. Gather scripts payload (excluding already cached hashes)
        var cachedSet = new HashSet<string>(
            (req.AlreadyCachedHashes ?? []).Where(h => !string.IsNullOrWhiteSpace(h)),
            StringComparer.OrdinalIgnoreCase
        );

        var resultScripts = new List<AcquiredScriptItemDto>();
        foreach (var hash in requestedHashes)
        {
            if (cachedSet.Contains(hash))
            {
                continue;
            }
            if (validScriptsByHash.TryGetValue(hash, out var scriptEntity))
            {
                resultScripts.Add(new AcquiredScriptItemDto(
                    scriptEntity.ScriptHash,
                    scriptEntity.Key,
                    scriptEntity.Executor,
                    scriptEntity.SourceCode,
                    scriptEntity.RequirementsJson
                ));
            }
        }

        await Send.OkAsync(new AcquireComponentScriptsResponse(
            Allowed: true,
            RemainingQuota: remainingQuota,
            Scripts: resultScripts
        ), ct);
    }
}
