using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Pipelines;

public record PublishScriptArtifactDto(
    string Key,
    string Executor,
    string SourceCode,
    JsonDocument? RequirementsJson
);

public record PublishCloudPipelineRequest(
    Guid? PipelineId,
    string Name,
    Guid? StudioId,
    JsonDocument DagBundleJson,
    JsonDocument ContractsJson,
    List<PublishScriptArtifactDto> Scripts,
    string PublishAs = "Template", // "Template" | "Project"
    Guid? ProjectId = null,
    string? Title = null,
    string? Description = null,
    string? Category = null,
    int? DefaultQuotaLimit = 20
);

public record PublishCloudPipelineResponse(
    Guid PipelineId,
    Guid PipelineVersionId,
    int VersionNumber,
    Guid? TemplateViewId,
    Guid? ProjectViewId
);

public class PublishCloudPipelineEndpoint(PipelineDbContext db)
    : Endpoint<PublishCloudPipelineRequest, PublishCloudPipelineResponse>
{
    public override void Configure()
    {
        Post("publish-cloud");
        Group<PipelinesGroup>();
        Description(b => b
            .Produces<PublishCloudPipelineResponse>(200)
            .WithSummary("Publish an immutable Cloud PipelineVersion and create a Template or Project View"));
    }

    public override async Task HandleAsync(PublishCloudPipelineRequest req, CancellationToken ct)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var ownerUserId = Guid.TryParse(userIdStr, out var parsed) ? parsed : Guid.Empty;

        var isTemplate = string.Equals(req.PublishAs, "Template", StringComparison.OrdinalIgnoreCase);

        // Strip personal constant values when publishing as a public Template
        var contractsDoc = isTemplate
            ? StripConstantValues(req.ContractsJson)
            : req.ContractsJson;

        var dagRaw = req.DagBundleJson.RootElement.GetRawText();
        var graphHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(dagRaw))).ToLowerInvariant();

        var targetProjectId = req.ProjectId ?? Guid.Empty;
        CloudPipeline? pipeline = null;
        if (req.PipelineId.HasValue)
        {
            pipeline = await db.Pipelines.FirstOrDefaultAsync(x => x.Id == req.PipelineId.Value, ct);
        }
        if (pipeline is null)
        {
            pipeline = await db.Pipelines.FirstOrDefaultAsync(
                x => x.ProjectId == targetProjectId && x.Name == req.Name,
                ct
            );
        }

        if (pipeline is null)
        {
            pipeline = new CloudPipeline(
                targetProjectId,
                req.Name
            );
            db.Pipelines.Add(pipeline);
        }
        else
        {
            pipeline.UpdateName(req.Name);
        }

        var maxVersion = await db.PipelineVersions
            .Where(v => v.PipelineId == pipeline.Id)
            .Select(v => (int?)v.VersionNumber)
            .MaxAsync(ct) ?? 0;

        var newVersion = new PipelineVersion
        {
            Pipeline = pipeline,
            VersionNumber = maxVersion + 1,
            GraphHash = graphHash,
            DagBundleJson = req.DagBundleJson,
            ContractsJson = contractsDoc,
        };
        db.PipelineVersions.Add(newVersion);

        var scriptsByIdentity = new Dictionary<string, PipelineScript>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in req.Scripts)
        {
            var raw = s.SourceCode ?? string.Empty;
            var scriptHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
            var identity = $"{s.Key}\0{scriptHash}";
            if (!scriptsByIdentity.TryGetValue(identity, out var script))
            {
                script = await db.PipelineScripts.FirstOrDefaultAsync(
                    x => x.Key == s.Key && x.ScriptHash == scriptHash,
                    ct
                );

                if (script is null)
                {
                    script = new PipelineScript
                    {
                        Key = s.Key,
                        Executor = s.Executor,
                        ScriptHash = scriptHash,
                        SourceCode = raw,
                        RequirementsJson = s.RequirementsJson ?? JsonDocument.Parse("[]")
                    };
                    db.PipelineScripts.Add(script);
                }

                scriptsByIdentity.Add(identity, script);
            }

            newVersion.VersionScripts.Add(new PipelineVersionScript
            {
                PipelineVersion = newVersion,
                PipelineScript = script
            });
        }

        Guid? templateViewId = null;
        Guid? projectViewId = null;

        if (isTemplate)
        {
            var tView = new TemplatePackage
            {
                PrimaryMasterVersion = newVersion,
                Title = !string.IsNullOrWhiteSpace(req.Title) ? req.Title.Trim() : req.Name,
                Description = req.Description,
                Category = string.IsNullOrWhiteSpace(req.Category) ? "General" : req.Category.Trim(),
                IsPublic = true,
                QuotaStrategy = "PerExecution",
                DefaultQuotaLimit = req.DefaultQuotaLimit
            };
            db.TemplatePackages.Add(tView);
            templateViewId = tView.Id;
        }
        else
        {
            var pView = new ProjectPipelineView
            {
                ProjectId = targetProjectId,
                Pipeline = pipeline,
                PinnedVersion = newVersion
            };
            db.ProjectPipelineViews.Add(pView);
            projectViewId = pView.Id;
        }

        await db.SaveChangesAsync(ct);

        await Send.OkAsync(new PublishCloudPipelineResponse(
            pipeline.Id,
            newVersion.Id,
            newVersion.VersionNumber,
            templateViewId,
            projectViewId
        ), ct);
    }

    private static JsonDocument StripConstantValues(JsonDocument contractsJson)
    {
        try
        {
            var root = JsonNode.Parse(contractsJson.RootElement.GetRawText());
            if (root is JsonObject obj && obj["constants"] is JsonArray constantsArray)
            {
                foreach (var item in constantsArray)
                {
                    if (item is JsonObject cObj)
                    {
                        cObj.Remove("currentValue");
                        cObj.Remove("value");
                    }
                }
            }
            return JsonDocument.Parse(root?.ToJsonString() ?? "{}");
        }
        catch
        {
            return contractsJson;
        }
    }
}
