using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Pipelines;

public record IngestPipelineItemDto(
    string Slug,
    string Name,
    string PipelineKind, // "master" | "component"
    string? Executor,
    JsonDocument GraphJson,
    JsonDocument ContractsJson
);

public record IngestScriptItemDto(
    string Key,
    string Executor,
    string SourceCode,
    JsonDocument? RequirementsJson
);

public record IngestCloudPipelineDataRequest(
    List<IngestPipelineItemDto> Pipelines,
    List<IngestScriptItemDto> Scripts
);

public record IngestCloudPipelineDataResponse(
    Dictionary<string, Guid> PipelineVersionMap, // Key: "{Kind}:{Slug}" -> Guid (PipelineVersionId)
    Dictionary<string, Guid> ScriptArtifactMap   // Key: ScriptKey -> Guid (ScriptArtifactId)
);

public class IngestCloudPipelineDataEndpoint(PipelineDbContext db)
    : Endpoint<IngestCloudPipelineDataRequest, IngestCloudPipelineDataResponse>
{
    public override void Configure()
    {
        Post("cloud-data/ingest");
        Group<PipelinesGroup>();
        Description(b => b
            .Produces<IngestCloudPipelineDataResponse>(200)
            .WithSummary("Slice 1: Ingest, hash & deduplicate Pipelines, Components & Scripts into Cloud Data Pool"));
    }

    public override async Task HandleAsync(IngestCloudPipelineDataRequest req, CancellationToken ct)
    {
        var pipelineVersionMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var scriptArtifactMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);

        // 1. Process Pipelines (Masters & Components)
        foreach (var pipeDto in req.Pipelines)
        {
            var rawGraph = pipeDto.GraphJson.RootElement.GetRawText();
            var graphHash = Convert
                .ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawGraph)))
                .ToLowerInvariant();
            var normalizedKind = string.Equals(
                pipeDto.PipelineKind,
                "component",
                StringComparison.OrdinalIgnoreCase
            )
                ? "component"
                : "master";

            // Find existing Pipeline by Name
            var pipeline = await db.Pipelines.FirstOrDefaultAsync(p => p.Name == pipeDto.Name, ct);

            if (pipeline is null)
            {
                pipeline = new CloudPipeline(Guid.Empty, pipeDto.Name, pipeDto.Slug, normalizedKind);
                db.Pipelines.Add(pipeline);
                await db.SaveChangesAsync(ct);
            }

            // Find if version with same GraphHash already exists
            var existingVersion = await db.PipelineVersions.FirstOrDefaultAsync(
                v => v.PipelineId == pipeline.Id && v.GraphHash == graphHash,
                ct
            );

            if (existingVersion is not null)
            {
                pipelineVersionMap[$"{normalizedKind}:{pipeDto.Slug}"] = existingVersion.Id;
            }
            else
            {
                var maxVer =
                    await db
                        .PipelineVersions.Where(v => v.PipelineId == pipeline.Id)
                        .Select(v => (int?)v.VersionNumber)
                        .MaxAsync(ct)
                    ?? 0;

                var newVersion = new PipelineVersion
                {
                    PipelineId = pipeline.Id,
                    VersionNumber = maxVer + 1,
                    GraphHash = graphHash,
                    PipelineKind = normalizedKind,
                    Slug = pipeDto.Slug,
                    DagBundleJson = pipeDto.GraphJson,
                    ContractsJson = pipeDto.ContractsJson,
                };
                db.PipelineVersions.Add(newVersion);
                await db.SaveChangesAsync(ct);

                pipelineVersionMap[$"{normalizedKind}:{pipeDto.Slug}"] = newVersion.Id;
            }
        }

        // 2. Process Scripts
        foreach (var s in req.Scripts)
        {
            var rawSource = s.SourceCode ?? string.Empty;
            var scriptHash = Convert
                .ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawSource)))
                .ToLowerInvariant();
            var executor = string.IsNullOrWhiteSpace(s.Executor) ? "python" : s.Executor;

            var existingScript = await db.PipelineScriptArtifacts.FirstOrDefaultAsync(
                sa => sa.ScriptKey == s.Key && sa.ScriptHash == scriptHash,
                ct
            );

            if (existingScript is not null)
            {
                scriptArtifactMap[s.Key] = existingScript.Id;
            }
            else
            {
                // Tie to first available pipeline version
                var sampleVersionId = pipelineVersionMap.Values.FirstOrDefault();
                var newScript = new PipelineScriptArtifact
                {
                    PipelineVersionId = sampleVersionId,
                    ScriptKey = s.Key,
                    ScriptHash = scriptHash,
                    Executor = executor,
                    SourceCode = rawSource,
                    RequirementsJson = s.RequirementsJson ?? JsonDocument.Parse("[]"),
                };
                db.PipelineScriptArtifacts.Add(newScript);
                await db.SaveChangesAsync(ct);

                scriptArtifactMap[s.Key] = newScript.Id;
            }
        }

        await Send.OkAsync(
            new IngestCloudPipelineDataResponse(pipelineVersionMap, scriptArtifactMap),
            ct
        );
    }
}
