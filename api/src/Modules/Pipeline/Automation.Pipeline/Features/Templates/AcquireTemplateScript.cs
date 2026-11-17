using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record AcquireTemplateScriptRequest(
    Guid PipelineVersionId,
    string ScriptKey,
    string MachineKey
);

public class AcquireTemplateScriptEndpoint(PipelineDbContext db)
    : Endpoint<AcquireTemplateScriptRequest>
{
    public override void Configure()
    {
        Post("acquire-script");
        Group<TemplatesGroup>();
        Description(b =>
            b.WithSummary("Acquire script source code for an immutable template pipeline")
        );
    }

    public override async Task HandleAsync(AcquireTemplateScriptRequest req, CancellationToken ct)
    {
        var artifact = await db
            .PipelineScriptArtifacts.AsNoTracking()
            .FirstOrDefaultAsync(
                a => a.PipelineVersionId == req.PipelineVersionId && a.ScriptKey == req.ScriptKey,
                ct
            );

        if (artifact is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        await Send.OkAsync(
            new
            {
                key = artifact.ScriptKey,
                executor = artifact.Executor,
                scriptHash = artifact.ScriptHash,
                sourceCode = artifact.SourceCode,
                requirements = artifact.RequirementsJson,
            },
            ct
        );
    }
}
