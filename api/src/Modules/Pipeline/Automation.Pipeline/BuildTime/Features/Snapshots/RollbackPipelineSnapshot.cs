using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.BuildTime.Features.Authoring;
using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.BuildTime.Graph;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.SharedKernel.Errors;

namespace Automation.Pipeline.BuildTime.Features.Snapshots;

public record RollbackPipelineSnapshotCommand(Guid PipelineId, Guid SnapshotId);

public class RollbackPipelineSnapshotEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<PipelineGraphDto>
{
    public override void Configure()
    {
        Post("{id:guid}/snapshots/{snapshotId:guid}/rollback");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineGraphDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var snapshotId = Route<Guid>("snapshotId");
        var result = await bus.InvokeAsync<Result<PipelineGraphDto>>(
            new RollbackPipelineSnapshotCommand(pipelineId, snapshotId),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class RollbackPipelineSnapshotHandler(
    PipelineDbContext db,
    IPipelineGraphDtoBuilder graphDtoBuilder
)
{
    public async Task<Result<PipelineGraphDto>> HandleAsync(
        RollbackPipelineSnapshotCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .FirstOrDefaultAsync(p => p.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineGraphDto>(
                new NotFoundError($"Pipeline '{command.PipelineId}' not found.")
            );
        }

        var snapshot = await db.PipelineSnapshots
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == command.SnapshotId && s.PipelineId == command.PipelineId, ct);

        if (snapshot == null)
        {
            return Result.Fail<PipelineGraphDto>(
                new NotFoundError($"Snapshot '{command.SnapshotId}' not found for pipeline '{command.PipelineId}'.")
            );
        }

        // Khôi phục Working Draft trên Canvas từ Snapshot
        pipeline.GraphData = snapshot.GraphData;
        pipeline.GraphHash = snapshot.GraphHash;
        pipeline.ActiveSnapshotId = snapshot.Id;

        await db.SaveChangesAsync(ct);

        var graphDto = await graphDtoBuilder.BuildDtoAsync(pipeline, ct);
        db.ChangeTracker.Clear();
        return Result.Ok(graphDto);
    }
}

