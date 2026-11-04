using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.BuildTime.Features.Authoring;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.SharedKernel.Errors;

namespace Automation.Pipeline.BuildTime.Features.Snapshots;

public class CreatePipelineSnapshotRequest
{
    public string? Summary { get; set; }
}

public record CreatePipelineSnapshotCommand(Guid PipelineId, string? Summary);

public class CreatePipelineSnapshotEndpoint(IMessageBus bus)
    : Endpoint<CreatePipelineSnapshotRequest, PipelineSnapshotSummaryDto>
{
    public override void Configure()
    {
        Post("{id:guid}/snapshots");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineSnapshotSummaryDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(CreatePipelineSnapshotRequest req, CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<PipelineSnapshotSummaryDto>>(
            new CreatePipelineSnapshotCommand(pipelineId, req.Summary),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class CreatePipelineSnapshotHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineSnapshotSummaryDto>> HandleAsync(
        CreatePipelineSnapshotCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .FirstOrDefaultAsync(p => p.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineSnapshotSummaryDto>(
                new NotFoundError($"Pipeline '{command.PipelineId}' not found.")
            );
        }

        // 1. Tính toán SHA-256 Hash từ GraphData hiện tại
        var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(pipeline.GraphData);
        var graphHash = Convert.ToHexString(SHA256.HashData(jsonBytes)).ToLowerInvariant();
        pipeline.GraphHash = graphHash;

        // 2. Tìm version lớn nhất hiện tại
        var maxVersion = await db.PipelineSnapshots
            .Where(s => s.PipelineId == pipeline.Id)
            .MaxAsync(s => (int?)s.VersionNumber, ct) ?? 0;

        var snapshot = new PipelineSnapshot(
            pipeline.Id,
            maxVersion + 1,
            pipeline.GraphData,
            graphHash,
            PipelineSnapshotSource.ManualCheckpoint,
            command.Summary
        );

        db.PipelineSnapshots.Add(snapshot);
        pipeline.ActiveSnapshotId = snapshot.Id;

        // 3. Inline Rolling Prune: Giữ tối đa 50 bản gần nhất không gắn với Execution
        var totalSnapshots = await db.PipelineSnapshots.CountAsync(s => s.PipelineId == pipeline.Id, ct);
        if (totalSnapshots > 50)
        {
            var pinnedSnapshotIds = await db.PipelineExecutions
                .Where(e => e.PipelineId == pipeline.Id && e.SnapshotId != null)
                .Select(e => e.SnapshotId!.Value)
                .Distinct()
                .ToListAsync(ct);

            var pruneCandidates = await db.PipelineSnapshots
                .Where(s => s.PipelineId == pipeline.Id && !pinnedSnapshotIds.Contains(s.Id) && s.Id != snapshot.Id)
                .OrderBy(s => s.VersionNumber)
                .Take(totalSnapshots - 50)
                .ToListAsync(ct);

            if (pruneCandidates.Count > 0)
            {
                db.PipelineSnapshots.RemoveRange(pruneCandidates);
            }
        }

        await db.SaveChangesAsync(ct);

        var dto = new PipelineSnapshotSummaryDto(
            snapshot.Id,
            snapshot.PipelineId,
            snapshot.VersionNumber,
            snapshot.GraphHash,
            snapshot.Source,
            snapshot.Summary,
            true,
            snapshot.CreatedAt,
            snapshot.CreatedBy
        );

        return Result.Ok(dto);
    }
}

