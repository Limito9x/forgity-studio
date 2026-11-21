using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.CloudData;

public record IngestManifestPipelineItemDto(
    string Slug,
    string Kind,
    string RelativePath,
    string GraphSource,
    string GraphHash,
    List<string> DependsOn,
    List<string> ScriptKeys
);

public record IngestManifestScriptItemDto(
    string Key,
    string Executor,
    string ContentHash,
    string SourceCode,
    List<string> Requirements,
    List<string> UsedBy
);

public record IngestManifestDto(
    string RootPath,
    List<IngestManifestPipelineItemDto> Pipelines,
    List<IngestManifestScriptItemDto> Scripts
);

public record IngestGraphPayloadDto(
    string Slug,
    string GraphHash,
    JsonDocument DagBundleJson,
    JsonDocument ContractsJson
);

public record IngestCloudDataManifestRequest(
    IngestManifestDto Manifest,
    List<IngestGraphPayloadDto> Graphs
);

public record IngestCloudDataManifestResponse(
    Dictionary<string, Guid> VersionIdsBySlug,
    Dictionary<string, Guid> ScriptIdsByKey,
    int CreatedPipelines,
    int CreatedVersions,
    int CreatedScripts
);

public class IngestCloudDataManifestEndpoint(PipelineDbContext db)
    : Endpoint<IngestCloudDataManifestRequest, IngestCloudDataManifestResponse>
{
    public override void Configure()
    {
        Post("manifest/ingest");
        Group<CloudDataGroup>();
        Permissions(Constants.PipelinePermissions.Pipeline.Create);
        Description(b => b.WithSummary("Idempotent ingest of canonical pipeline graphs and scripts into Unified Cloud Data Pool"));
    }

    public override async Task HandleAsync(IngestCloudDataManifestRequest req, CancellationToken ct)
    {
        var versionIdsBySlug = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var scriptIdsByKey = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        int createdPipelines = 0;
        int createdVersions = 0;
        int createdScripts = 0;

        // 1. Upsert content-addressed PipelineScripts by (Key, ScriptHash)
        var scriptEntityByKey = new Dictionary<string, PipelineScript>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in req.Manifest.Scripts)
        {
            var hash = string.IsNullOrWhiteSpace(s.ContentHash)
                ? ComputeSha256(s.SourceCode)
                : s.ContentHash;

            var existingScript = await db.PipelineScripts
                .FirstOrDefaultAsync(x => x.Key == s.Key && x.ScriptHash == hash, ct);

            if (existingScript is null)
            {
                var reqJson = JsonDocument.Parse(JsonSerializer.Serialize(s.Requirements ?? []));
                existingScript = new PipelineScript
                {
                    Key = s.Key,
                    Executor = string.IsNullOrWhiteSpace(s.Executor) ? "python" : s.Executor,
                    ScriptHash = hash,
                    SourceCode = s.SourceCode,
                    RequirementsJson = reqJson,
                };
                db.PipelineScripts.Add(existingScript);
                createdScripts++;
            }

            scriptEntityByKey[s.Key] = existingScript;
            scriptIdsByKey[s.Key] = existingScript.Id;
        }

        // 2. Map graphs by slug
        var graphBySlug = req.Graphs.ToDictionary(g => g.Slug, StringComparer.OrdinalIgnoreCase);

        // 3. Upsert CloudPipeline (global by Slug) + idempotent PipelineVersion (by GraphHash)
        foreach (var p in req.Manifest.Pipelines)
        {
            var pipeline = await db.Pipelines
                .Include(x => x.Versions)
                .FirstOrDefaultAsync(x => x.Slug == p.Slug, ct);

            if (pipeline is null)
            {
                pipeline = new CloudPipeline(null, p.Slug, p.Slug, p.Kind);
                db.Pipelines.Add(pipeline);
                createdPipelines++;
            }

            var graphPayload = graphBySlug.GetValueOrDefault(p.Slug);
            var effectiveGraphHash = !string.IsNullOrWhiteSpace(graphPayload?.GraphHash)
                ? graphPayload.GraphHash
                : p.GraphHash;

            var existingVersion = pipeline.Versions
                .FirstOrDefault(v => v.GraphHash == effectiveGraphHash);

            if (existingVersion is not null)
            {
                // Nếu version cũ có DagBundleJson rỗng ({}) và payload mới có graph thì cập nhật bù
                var existingRaw = existingVersion.DagBundleJson?.RootElement.GetRawText() ?? "{}";
                var incomingRaw = graphPayload?.DagBundleJson?.RootElement.GetRawText() ?? "{}";
                if (existingRaw == "{}" && incomingRaw != "{}")
                {
                    existingVersion.DagBundleJson = graphPayload!.DagBundleJson;
                    if (graphPayload.ContractsJson is not null)
                    {
                        existingVersion.ContractsJson = graphPayload.ContractsJson;
                        existingVersion.ContractsHash = ComputeSha256(graphPayload.ContractsJson.RootElement.GetRawText());
                    }
                }

                versionIdsBySlug[p.Slug] = existingVersion.Id;
                continue;
            }

            var nextVersionNumber = pipeline.Versions.Count == 0
                ? 1
                : pipeline.Versions.Max(v => v.VersionNumber) + 1;

            var contractsJson = graphPayload?.ContractsJson ?? JsonDocument.Parse("{}");
            var contractsHash = ComputeSha256(contractsJson.RootElement.GetRawText());

            var newVersion = new PipelineVersion
            {
                PipelineId = pipeline.Id,
                Pipeline = pipeline,
                VersionNumber = nextVersionNumber,
                GraphHash = effectiveGraphHash,
                ContractsHash = contractsHash,
                PipelineKind = p.Kind,
                Slug = p.Slug,
                DagBundleJson = graphPayload?.DagBundleJson ?? JsonDocument.Parse("{}"),
                ContractsJson = contractsJson,
            };

            foreach (var scriptKey in p.ScriptKeys.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (scriptEntityByKey.TryGetValue(scriptKey, out var scriptEntity))
                {
                    newVersion.VersionScripts.Add(new PipelineVersionScript
                    {
                        PipelineVersion = newVersion,
                        PipelineScript = scriptEntity,
                    });
                }
            }

            db.PipelineVersions.Add(newVersion);
            createdVersions++;
            versionIdsBySlug[p.Slug] = newVersion.Id;
        }

        await db.SaveChangesAsync(ct);

        await Send.OkAsync(new IngestCloudDataManifestResponse(
            versionIdsBySlug,
            scriptIdsByKey,
            createdPipelines,
            createdVersions,
            createdScripts
        ), ct);
    }

    private static string ComputeSha256(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexStringLower(bytes);
    }
}
