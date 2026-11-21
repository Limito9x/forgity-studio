using System.Text.Json;
using System.Text.Json.Nodes;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Features.Templates;

namespace Automation.Pipeline.Features.Pipelines;

public record DispatchBundleRequest(
    Guid? LibraryItemId,
    Guid? TemplatePackageId,
    Guid? ProjectViewId,
    Guid? TargetPipelineVersionId,
    string MachineKey,
    Dictionary<string, JsonElement>? RuntimeInputs
);

public class DispatchCloudBundleEndpoint(PipelineDbContext db)
    : Endpoint<DispatchBundleRequest, JsonObject>
{
    public override void Configure()
    {
        Post("dispatch-bundle");
        Group<PipelinesGroup>();
        Description(b => b.WithSummary("Dispatch execution bundle for a template or project pipeline to local runner"));
    }

    public override async Task HandleAsync(DispatchBundleRequest req, CancellationToken ct)
    {
        PipelineVersion? version = null;
        TemplatePackage? pkg = null;
        TemplateLibraryItem? libraryItem = null;
        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);

        if (req.LibraryItemId.HasValue || req.TemplatePackageId.HasValue)
        {
            if (req.LibraryItemId.HasValue)
            {
                libraryItem = await db
                    .TemplateLibraryItems.AsNoTracking()
                    .Include(x => x.TemplatePackage)
                        .ThenInclude(t => t.PrimaryMasterVersion)
                    .FirstOrDefaultAsync(
                        x => x.Id == req.LibraryItemId.Value && x.OwnerUserId == ownerUserId,
                        ct
                    );
                pkg = libraryItem?.TemplatePackage;
            }
            else if (req.TemplatePackageId.HasValue)
            {
                pkg = await db
                    .TemplatePackages.AsNoTracking()
                    .Include(t => t.PrimaryMasterVersion)
                    .FirstOrDefaultAsync(t => t.Id == req.TemplatePackageId.Value, ct);

                if (pkg is not null)
                {
                    libraryItem = await db
                        .TemplateLibraryItems.AsNoTracking()
                        .FirstOrDefaultAsync(
                            x =>
                                x.OwnerUserId == ownerUserId
                                && x.TemplatePackageId == pkg.Id
                                && x.MachineKey == req.MachineKey
                                && x.PeriodKey == "lifetime",
                            ct
                        );
                }
            }

            if (pkg is null)
            {
                await Send.NotFoundAsync(ct);
                return;
            }

            if (libraryItem is null)
            {
                HttpContext.Response.StatusCode = 403;
                await HttpResponseJsonExtensions.WriteAsJsonAsync(
                    HttpContext.Response,
                    new
                    {
                        error = "TEMPLATE_NOT_IN_LIBRARY",
                        message = "Add this template to My Library before running.",
                    },
                    ct
                );
                return;
            }

            var targetVersionId = req.TargetPipelineVersionId ?? pkg.PrimaryMasterVersionId;
            if (targetVersionId.HasValue)
            {
                version = await db.PipelineVersions.AsNoTracking()
                    .FirstOrDefaultAsync(v => v.Id == targetVersionId.Value, ct);
            }
        }
        else if (req.ProjectViewId.HasValue)
        {
            var pView = await db
                .ProjectPipelineViews.AsNoTracking()
                .Include(v => v.PinnedVersion)
                .FirstOrDefaultAsync(v => v.Id == req.ProjectViewId.Value, ct);

            if (pView is null)
            {
                await Send.NotFoundAsync(ct);
                return;
            }
            version = pView.PinnedVersion;
        }
        else if (req.TargetPipelineVersionId.HasValue)
        {
            version = await db
                .PipelineVersions.AsNoTracking()
                .FirstOrDefaultAsync(v => v.Id == req.TargetPipelineVersionId.Value, ct);
        }

        if (version is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        // Quota verification
        if (libraryItem is not null && libraryItem.MaxRuns.HasValue)
        {
            if (libraryItem.UsedRuns >= libraryItem.MaxRuns.Value)
            {
                HttpContext.Response.StatusCode = 402;
                await HttpResponseJsonExtensions.WriteAsJsonAsync(
                    HttpContext.Response,
                    new
                    {
                        error = "QUOTA_EXHAUSTED",
                        message = "Template execution quota has been exhausted. Contact author or upgrade quota.",
                    },
                    ct
                );
                return;
            }
        }

        // Fetch scripts linked to this immutable pipeline version.
        var scripts = await db
            .PipelineVersionScripts.AsNoTracking()
            .Where(link => link.PipelineVersionId == version.Id)
            .Select(link => link.PipelineScript)
            .ToListAsync(ct);

        var scriptsNode = new JsonObject();
        foreach (var script in scripts)
        {
            scriptsNode[script.Key] = new JsonObject
            {
                ["sourceCode"] = script.SourceCode,
                ["scriptHash"] = script.ScriptHash,
                ["executor"] = script.Executor,
                ["requirements"] = JsonNode.Parse(script.RequirementsJson.RootElement.GetRawText()),
            };
        }

        var bundle = new JsonObject
        {
            ["pipelineVersionId"] = version.Id.ToString(),
            ["versionNumber"] = version.VersionNumber,
            ["graphHash"] = version.GraphHash,
            ["pipelineKind"] = version.PipelineKind,
            ["slug"] = version.Slug,
            ["dagBundle"] = JsonNode.Parse(version.DagBundleJson.RootElement.GetRawText()),
            ["contracts"] = JsonNode.Parse(version.ContractsJson.RootElement.GetRawText()),
            ["environmentConstants"] = new JsonObject(),
            ["scripts"] = scriptsNode,
        };

        if (req.RuntimeInputs is not null)
        {
            var inputsNode = new JsonObject();
            foreach (var (k, v) in req.RuntimeInputs)
            {
                inputsNode[k] = JsonNode.Parse(v.GetRawText());
            }
            bundle["runtimeInputs"] = inputsNode;
        }

        await Send.OkAsync(bundle, ct);
    }
}
