using System.Text.Json;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.CloudData;

public record CloudDataVersionScriptDto(
    Guid ScriptId,
    string Key,
    string Executor,
    string ScriptHash
);

public record CloudDataPipelineVersionDetailDto(
    Guid VersionId,
    Guid PipelineId,
    string Slug,
    string PipelineKind,
    int VersionNumber,
    string GraphHash,
    string ContractsHash,
    JsonDocument DagBundleJson,
    JsonDocument ContractsJson,
    List<CloudDataVersionScriptDto> Scripts,
    DateTimeOffset CreatedAt
);

public class GetCloudDataPipelineVersionEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<CloudDataPipelineVersionDetailDto>
{
    public override void Configure()
    {
        Get("pipelines/{versionId:guid}");
        Group<CloudDataGroup>();
        Description(b => b.WithSummary("Get immutable pipeline version detail and linked scripts from Cloud Data Pool"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var versionId = Route<Guid>("versionId");

        var version = await db.PipelineVersions
            .AsNoTracking()
            .Include(v => v.VersionScripts)
                .ThenInclude(vs => vs.PipelineScript)
            .FirstOrDefaultAsync(v => v.Id == versionId, ct);

        if (version is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var scripts = version.VersionScripts
            .Select(vs => new CloudDataVersionScriptDto(
                vs.PipelineScriptId,
                vs.PipelineScript.Key,
                vs.PipelineScript.Executor,
                vs.PipelineScript.ScriptHash
            ))
            .ToList();

        await Send.OkAsync(new CloudDataPipelineVersionDetailDto(
            version.Id,
            version.PipelineId,
            version.Slug,
            version.PipelineKind,
            version.VersionNumber,
            version.GraphHash,
            version.ContractsHash,
            version.DagBundleJson,
            version.ContractsJson,
            scripts,
            version.CreatedAt
        ), ct);
    }
}
