using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record DeletePipelineEdgeCommand(
    Guid PipelineId,
    Guid EdgeId
);

public record DeletePipelineEdgeRequest(
    Guid PipelineId,
    Guid EdgeId
);

public class DeletePipelineEdgeEndpoint : Endpoint<DeletePipelineEdgeRequest>
{
    public override void Configure()
    {
        Delete("{PipelineId:guid}/edges/{EdgeId:guid}");
        Group<PipelinesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(DeletePipelineEdgeRequest req, CancellationToken ct)
    {
        var command = req.Adapt<DeletePipelineEdgeCommand>();
        var result = await Resolve<IMessageBus>().InvokeAsync<Result>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class DeletePipelineEdgeHandler(PipelineDbContext db)
{
    public async Task<Result> HandleAsync(
        DeletePipelineEdgeCommand command,
        CancellationToken ct
    )
    {
        var edge = await db.PipelineEdges
            .FirstOrDefaultAsync(x => x.Id == command.EdgeId && x.PipelineId == command.PipelineId, ct);

        if (edge == null)
        {
            return Result.Fail($"Edge '{command.EdgeId}' not found in Pipeline '{command.PipelineId}'.");
        }

        db.PipelineEdges.Remove(edge);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
