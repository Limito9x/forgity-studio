using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.SharedKernel.Errors;

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
            return Result.Fail(new NotFoundError($"Pipeline '{command.Id}' was not found."));
        }

        // Chặn Archive nếu đang có lượt chạy Running / Pending
        var hasActiveExecutions = await db.PipelineExecutions
            .AnyAsync(x => x.PipelineId == command.Id && 
                (x.Status == Domain.Enums.ExecutionStatus.Running || x.Status == Domain.Enums.ExecutionStatus.Pending), ct);

        if (hasActiveExecutions)
        {
            return Result.Fail(new ConflictError($"Cannot archive pipeline '{pipeline.Name}' because it currently has active running executions."));
        }

        // Chặn Archive nếu đang được gọi làm SubPipeline trong pipeline active khác
        var pipelineIdStr = command.Id.ToString();
        var isUsedAsSubPipeline = await db.Pipelines
            .AnyAsync(p => p.Id != command.Id 
                        && p.DeletedAt == null 
                        && p.Nodes.Any(n => n.Kind == Constants.PipelineNodeKind.SubPipeline && n.RefId == pipelineIdStr), ct);

        if (isUsedAsSubPipeline)
        {
            return Result.Fail(new ConflictError($"Cannot archive pipeline '{pipeline.Name}' because it is currently referenced as a SubPipeline in active pipeline(s)."));
        }

        // Soft Delete (Archive): bảo toàn 100% Nodes, Edges, AssetLinks và Executions
        pipeline.Archive();
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
