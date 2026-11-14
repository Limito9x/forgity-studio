using Automation.SharedKernel;
using Automation.Studio.Contracts;
using FastEndpoints;

namespace Automation.Studio.Features.Studios;

public record GetStudioQuotaRequest(string Slug);

public class GetStudioQuotaEndpoint(IStudioApi studioApi)
    : Endpoint<GetStudioQuotaRequest, StudioQuotaDto>
{
    public override void Configure()
    {
        Get("/{slug}/quota");
        Group<StudiosGroup>();
        Description(b =>
            b.Produces<StudioQuotaDto>(200)
                .ProducesProblem(404)
                .WithSummary("Get Studio Quota & Usage")
                .WithDescription(
                    "Retrieves the execution credits and managed cloud storage usage for a given studio."
                )
        );
    }

    public override async Task HandleAsync(GetStudioQuotaRequest req, CancellationToken ct)
    {
        var result = await studioApi.GetStudioQuotaBySlugAsync(req.Slug, ct);
        await this.SendResultAsync(result, ct);
    }
}
