using System.Text.Json;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.CloudData;

public record CloudDataScriptDetailDto(
    Guid ScriptId,
    string Key,
    string Executor,
    string ScriptHash,
    string SourceCode,
    JsonDocument RequirementsJson,
    DateTimeOffset CreatedAt
);

public class GetCloudDataScriptEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<CloudDataScriptDetailDto>
{
    public override void Configure()
    {
        Get("scripts/{scriptId:guid}");
        Group<CloudDataGroup>();
        Description(b => b.WithSummary("Get content-addressed script source from Cloud Data Pool"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var scriptId = Route<Guid>("scriptId");

        var script = await db.PipelineScripts
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == scriptId, ct);

        if (script is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        await Send.OkAsync(new CloudDataScriptDetailDto(
            script.Id,
            script.Key,
            script.Executor,
            script.ScriptHash,
            script.SourceCode,
            script.RequirementsJson,
            script.CreatedAt
        ), ct);
    }
}
