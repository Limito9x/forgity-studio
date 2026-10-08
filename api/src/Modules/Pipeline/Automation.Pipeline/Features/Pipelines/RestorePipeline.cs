using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Features.Pipelines.Dtos;

namespace Automation.Pipeline.Features.Pipelines;

public record RestorePipelineCommand(Guid Id);

public class RestorePipelineEndpoint(IMessageBus bus) : EndpointWithoutRequest<PipelineSummaryDto>
{
    public override void Configure()
    {
        Post("{id:guid}/restore");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineSummaryDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var command = new RestorePipelineCommand(id);
        var result = await bus.InvokeAsync<Result<PipelineSummaryDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class RestorePipelineHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineSummaryDto>> HandleAsync(
        RestorePipelineCommand command,
        CancellationToken ct
    )
    {
        // Query bỏ qua QueryFilter để lấy pipeline đã bị Soft Delete
        var pipeline = await db.Pipelines
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.Id == command.Id && x.DeletedAt != null, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineSummaryDto>($"Archived pipeline '{command.Id}' was not found in trash.");
        }

        // Tự động kiểm tra và giải quyết xung đột tên với các pipeline đang Active
        var baseName = pipeline.Name;
        var resolvedName = baseName;
        var counter = 1;

        while (await db.Pipelines.AnyAsync(
            x => x.ProjectId == pipeline.ProjectId && x.Id != pipeline.Id && x.Name.ToLower() == resolvedName.ToLower(),
            ct
        ))
        {
            resolvedName = counter == 1 ? $"{baseName} (Restored)" : $"{baseName} (Restored {counter})";
            counter++;
        }

        // Khôi phục pipeline về trạng thái Active
        pipeline.Restore(resolvedName);
        await db.SaveChangesAsync(ct);

        // Load số lượng nodes & edges để trả về DTO
        var nodeCount = await db.PipelineNodes.CountAsync(x => x.PipelineId == pipeline.Id, ct);
        var edgeCount = await db.PipelineEdges.CountAsync(x => x.PipelineId == pipeline.Id, ct);

        var dto = new PipelineSummaryDto(
            pipeline.Id,
            pipeline.ProjectId,
            pipeline.Name,
            pipeline.TriggerType,
            nodeCount,
            edgeCount,
            pipeline.CreatedAt,
            pipeline.TriggerConfig
        );

        return Result.Ok(dto);
    }
}
