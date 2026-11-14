using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.SharedKernel.Errors;
using Automation.Files.Contracts;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.BuildTime.Features.Authoring;

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
public class PurgePipelineHandler(PipelineDbContext db, IAssetApi assetApi)
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
            return Result.Fail(new NotFoundError($"Archived pipeline '{command.Id}' was not found in trash."));
        }

        // Chặn nếu vẫn còn executions đang chạy
        var hasRunningExecutions = await db.PipelineExecutions
            .AnyAsync(x => x.PipelineId == command.Id && 
                (x.Status == Domain.Enums.ExecutionStatus.Running || x.Status == Domain.Enums.ExecutionStatus.Pending), ct);

        if (hasRunningExecutions)
        {
            return Result.Fail(new ConflictError($"Cannot permanently delete pipeline '{pipeline.Name}' because it has active running executions."));
        }

        // Chặn Purge nếu đang được gọi làm SubPipeline trong pipeline active khác
        var pipelineIdStr = command.Id.ToString();
        var allOtherGraphs = await db.Pipelines
            .Where(p => p.Id != command.Id && p.DeletedAt == null)
            .Select(p => p.GraphData)
            .ToListAsync(ct);
        var isUsedAsSubPipeline = allOtherGraphs
            .Any(g => g.Nodes.Any(n => n.Kind == Constants.PipelineNodeKind.SubPipeline && n.RefId == pipelineIdStr));

        if (isUsedAsSubPipeline)
        {
            return Result.Fail(new ConflictError($"Cannot permanently delete pipeline '{pipeline.Name}' because it is currently referenced as a SubPipeline in active pipeline(s)."));
        }

        // 1. Quét toàn bộ File Links trong GraphData.Nodes để thu hồi hàng loạt bằng Batch API
        var linksToRemove = new List<AssetLinkReference>();
        foreach (var node in pipeline.GraphData.Nodes)
        {
            if (node.Config != null)
            {
                linksToRemove.AddRange(PipelineFileValue.References(node.Id, node.Config));
            }
        }
        if (linksToRemove.Count > 0)
        {
            await assetApi.RemoveLinksByIdsAsync(linksToRemove, ct);
        }

        // 2. Dọn dẹp các Executions thuộc pipeline này (nếu có) để thỏa mãn Restrict foreign key

        // 3. Dọn dẹp các Executions thuộc pipeline này (nếu có) để thỏa mãn Restrict foreign key
        var executions = await db.PipelineExecutions
            .Where(x => x.PipelineId == command.Id)
            .ToListAsync(ct);

        if (executions.Count > 0)
        {
            db.PipelineExecutions.RemoveRange(executions);
        }

        // 4. Xóa vĩnh viễn bản ghi Pipeline (Snapshots sẽ được Postgres Cascade Delete)
        db.Pipelines.Remove(pipeline);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
