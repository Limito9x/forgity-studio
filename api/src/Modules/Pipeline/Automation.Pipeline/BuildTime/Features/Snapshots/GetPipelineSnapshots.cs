using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.BuildTime.Features.Authoring;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.SharedKernel.Errors;

namespace Automation.Pipeline.BuildTime.Features.Snapshots;

public record PipelineSnapshotSummaryDto(
    Guid Id,
    Guid PipelineId,
    int VersionNumber,
    string GraphHash,
    string Source,
    string? Summary,
    bool IsActive,
    DateTimeOffset CreatedAt,
    string? CreatedBy
);

public record GetPipelineSnapshotsQuery(Guid PipelineId);

public class GetPipelineSnapshotsEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<List<PipelineSnapshotSummaryDto>>
{
    public override void Configure()
    {
        Get("{id:guid}/snapshots");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);
        Description(d => d
            .Produces<List<PipelineSnapshotSummaryDto>>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<List<PipelineSnapshotSummaryDto>>>(
            new GetPipelineSnapshotsQuery(pipelineId),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPipelineSnapshotsHandler(PipelineDbContext db)
{
    public async Task<Result<List<PipelineSnapshotSummaryDto>>> HandleAsync(
        GetPipelineSnapshotsQuery query,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == query.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<List<PipelineSnapshotSummaryDto>>(
                new NotFoundError($"Pipeline '{query.PipelineId}' not found.")
            );
        }

        var snapshots = await db.PipelineSnapshots
            .AsNoTracking()
            .Where(s => s.PipelineId == query.PipelineId)
            .OrderByDescending(s => s.VersionNumber)
            .Select(s => new PipelineSnapshotSummaryDto(
                s.Id,
                s.PipelineId,
                s.VersionNumber,
                s.GraphHash,
                s.Source,
                s.Summary,
                s.Id == pipeline.ActiveSnapshotId,
                s.CreatedAt,
                s.CreatedBy
            ))
            .ToListAsync(ct);

        return Result.Ok(snapshots);
    }
}

