using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record PurgePipelineCommand(Guid Id);

public class PurgePipelineEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("{id:guid}/purge");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Delete);
        Description(d => d
            .Produces(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var command = new PurgePipelineCommand(id);
        var result = await bus.InvokeAsync<Result>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class PurgePipelineHandler(PipelineDbContext db)
{
    public async Task<Result> HandleAsync(
        PurgePipelineCommand command,
        CancellationToken ct
    )
    {
        // Chỉ cho phép xóa vĩnh viễn những pipeline ĐÃ nằm trong thùng rác
        var pipeline = await db.Pipelines
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.Id == command.Id && x.DeletedAt != null, ct);

        if (pipeline == null)
        {
            return Result.Fail($"Archived pipeline '{command.Id}' was not found in trash.");
        }

        // Chặn nếu vẫn còn executions đang chạy
        var hasRunningExecutions = await db.PipelineExecutions
            .AnyAsync(x => x.PipelineId == command.Id && 
                (x.Status == Domain.Enums.ExecutionStatus.Running || x.Status == Domain.Enums.ExecutionStatus.Pending), ct);

        if (hasRunningExecutions)
        {
            return Result.Fail($"Cannot permanently delete pipeline '{pipeline.Name}' because it has active running executions.");
        }

        // 1. Xóa các Node trước (để kích hoạt EntityDeletedInterceptor dọn dẹp Asset Links)
        var nodes = await db.PipelineNodes
            .Where(x => x.PipelineId == command.Id)
            .ToListAsync(ct);

        if (nodes.Count > 0)
        {
            db.PipelineNodes.RemoveRange(nodes);
        }

        // 2. Xóa các Edges
        var edges = await db.PipelineEdges
            .Where(x => x.PipelineId == command.Id)
            .ToListAsync(ct);

        if (edges.Count > 0)
        {
            db.PipelineEdges.RemoveRange(edges);
        }

        // 3. Dọn dẹp các Executions thuộc pipeline này (nếu có) để thỏa mãn Restrict foreign key
        var executions = await db.PipelineExecutions
            .Where(x => x.PipelineId == command.Id)
            .ToListAsync(ct);

        if (executions.Count > 0)
        {
            db.PipelineExecutions.RemoveRange(executions);
        }

        // 4. Xóa vĩnh viễn bản ghi Pipeline
        db.Pipelines.Remove(pipeline);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
