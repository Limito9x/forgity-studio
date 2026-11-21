using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.CloudData;

public record CloudDataPipelineSummaryDto(
    Guid PipelineId,
    string Slug,
    string Name,
    string PipelineKind,
    int LatestVersionNumber,
    Guid? LatestVersionId,
    string? LatestGraphHash,
    DateTimeOffset UpdatedAt
);

public class GetCloudDataPipelinesEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<List<CloudDataPipelineSummaryDto>>
{
    public override void Configure()
    {
        Get("pipelines");
        Group<CloudDataGroup>();
        Permissions(Constants.PipelinePermissions.Pipeline.GetAll);
        Description(b => b.WithSummary("List all pipelines in the Unified Cloud Data Pool"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var kind = Query<string>("kind", isRequired: false);

        var query = db.Pipelines.AsNoTracking().Include(p => p.Versions).AsQueryable();
        if (!string.IsNullOrWhiteSpace(kind))
        {
            query = query.Where(p => p.PipelineKind == kind);
        }

        var pipelines = await query
            .OrderByDescending(p => p.UpdatedAt ?? p.CreatedAt)
            .ToListAsync(ct);

        var result = pipelines.Select(p =>
        {
            var latest = p.Versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
            return new CloudDataPipelineSummaryDto(
                p.Id,
                p.Slug,
                p.Name,
                p.PipelineKind,
                latest?.VersionNumber ?? 0,
                latest?.Id,
                latest?.GraphHash,
                p.UpdatedAt ?? p.CreatedAt
            );
        }).ToList();

        await Send.OkAsync(result, ct);
    }
}
