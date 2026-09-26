using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record DeletePipelineCommand(Guid Id);

public record DeletePipelineRequest(Guid Id);

public class DeletePipelineEndpoint : Endpoint<DeletePipelineRequest>
{
    public override void Configure()
    {
        Delete("{Id:guid}");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Delete);
    }

    public override async Task HandleAsync(DeletePipelineRequest req, CancellationToken ct)
    {
        var command = new DeletePipelineCommand(req.Id);
        var result = await Resolve<IMessageBus>().InvokeAsync<Result>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class DeletePipelineHandler(PipelineDbContext db)
{
    public async Task<Result> HandleAsync(
        DeletePipelineCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .FirstOrDefaultAsync(x => x.Id == command.Id, ct);

        if (pipeline == null)
        {
            return Result.Fail($"Pipeline '{command.Id}' was not found.");
        }

        // Xóa các Node trước để kích hoạt EntityDeletedInterceptor dọn dẹp Asset Links
        var nodes = await db.PipelineNodes
            .Where(x => x.PipelineId == command.Id)
            .ToListAsync(ct);

        if (nodes.Count > 0)
        {
            db.PipelineNodes.RemoveRange(nodes);
        }

        // Xóa các Edges
        var edges = await db.PipelineEdges
            .Where(x => x.PipelineId == command.Id)
            .ToListAsync(ct);

        if (edges.Count > 0)
        {
            db.PipelineEdges.RemoveRange(edges);
        }

        // Xóa các Inputs
        var inputs = await db.PipelineInputs
            .Where(x => x.PipelineId == command.Id)
            .ToListAsync(ct);

        if (inputs.Count > 0)
        {
            db.PipelineInputs.RemoveRange(inputs);
        }

        db.Pipelines.Remove(pipeline);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
