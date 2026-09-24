using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record AddPipelineEdgeCommand(
    Guid PipelineId,
    Guid SourcePipelineNodeId,
    string SourcePin,
    Guid TargetPipelineNodeId,
    string TargetPin
);

public record AddPipelineEdgeRequest(
    Guid PipelineId,
    Guid SourcePipelineNodeId,
    string SourcePin,
    Guid TargetPipelineNodeId,
    string TargetPin
);

public class AddPipelineEdgeEndpoint : Endpoint<AddPipelineEdgeRequest, PipelineEdgeGraphDto>
{
    public override void Configure()
    {
        Post("{PipelineId:guid}/edges");
        Group<PipelinesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(AddPipelineEdgeRequest req, CancellationToken ct)
    {
        var command = req.Adapt<AddPipelineEdgeCommand>();
        var result = await Resolve<IMessageBus>().InvokeAsync<Result<PipelineEdgeGraphDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class AddPipelineEdgeHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineEdgeGraphDto>> HandleAsync(
        AddPipelineEdgeCommand command,
        CancellationToken ct
    )
    {
        var pipelineExists = await db.Pipelines
            .AnyAsync(x => x.Id == command.PipelineId, ct);

        if (!pipelineExists)
        {
            return Result.Fail<PipelineEdgeGraphDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        // Validate source and target nodes exist
        var sourceExists = await db.PipelineNodes.AnyAsync(n => n.Id == command.SourcePipelineNodeId && n.PipelineId == command.PipelineId, ct);
        var targetExists = await db.PipelineNodes.AnyAsync(n => n.Id == command.TargetPipelineNodeId && n.PipelineId == command.PipelineId, ct);

        if (!sourceExists || !targetExists)
        {
            return Result.Fail<PipelineEdgeGraphDto>("Source or Target node does not exist in this Pipeline.");
        }

        // If connecting an ExecOut pin (1-to-1 flow rule), remove any old edge from this source exec pin
        var normSource = command.SourcePin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
        var isExecOut = normSource is "execout" or "exec" or "loopbody" or "completed";

        if (isExecOut)
        {
            var oldExecEdges = await db.PipelineEdges.Where(e =>
                e.PipelineId == command.PipelineId &&
                e.SourcePipelineNodeId == command.SourcePipelineNodeId &&
                (e.SourcePin == command.SourcePin ||
                 e.SourcePin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLower() == normSource)
            ).ToListAsync(ct);

            if (oldExecEdges.Count > 0)
            {
                db.PipelineEdges.RemoveRange(oldExecEdges);
            }
        }
        else
        {
            // In visual scripting, an input data pin can only receive 1 incoming wire.
            // Remove any existing edge targeting this same TargetPin to prevent ghost wires.
            var oldTargetEdges = await db.PipelineEdges.Where(e =>
                e.PipelineId == command.PipelineId &&
                e.TargetPipelineNodeId == command.TargetPipelineNodeId &&
                e.TargetPin == command.TargetPin
            ).ToListAsync(ct);

            if (oldTargetEdges.Count > 0)
            {
                db.PipelineEdges.RemoveRange(oldTargetEdges);
            }
        }

        var edge = new PipelineEdge(
            command.PipelineId,
            command.SourcePipelineNodeId,
            command.SourcePin,
            command.TargetPipelineNodeId,
            command.TargetPin
        );

        await db.PipelineEdges.AddAsync(edge, ct);
        await db.SaveChangesAsync(ct);

        return Result.Ok(new PipelineEdgeGraphDto(
            edge.Id,
            edge.SourcePipelineNodeId,
            edge.SourcePin,
            edge.TargetPipelineNodeId,
            edge.TargetPin
        ));
    }
}
