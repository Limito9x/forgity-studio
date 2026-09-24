using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.UpdatePipelineTrigger;

public class UpdatePipelineTriggerValidator : AbstractValidator<UpdatePipelineTriggerCommand>
{
    public UpdatePipelineTriggerValidator()
    {
        RuleFor(x => x.PipelineId).NotEmpty();
    }
}

[Transactional(typeof(PipelineDbContext))]
public class UpdatePipelineTriggerHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineSummaryDto>> HandleAsync(
        UpdatePipelineTriggerCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines.FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);
        if (pipeline == null)
        {
            return Result.Fail<PipelineSummaryDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        pipeline.UpdateTrigger(command.TriggerType, command.TriggerWorkspaceId, command.TriggerConfig);
        await db.SaveChangesAsync(ct);

        var nodeCount = await db.PipelineNodes.CountAsync(x => x.PipelineId == pipeline.Id, ct);
        var edgeCount = await db.PipelineEdges.CountAsync(x => x.PipelineId == pipeline.Id, ct);

        var dto = new PipelineSummaryDto(
            pipeline.Id,
            pipeline.ProjectId,
            pipeline.Name,
            pipeline.TriggerType,
            pipeline.TriggerWorkspaceId,
            nodeCount,
            edgeCount,
            pipeline.CreatedAt,
            pipeline.TriggerConfig
        );

        return Result.Ok(dto);
    }
}

public class UpdatePipelineTriggerEndpoint(IMessageBus bus) : Endpoint<UpdatePipelineTriggerRequest, PipelineSummaryDto>
{
    public override void Configure()
    {
        Put("{id:guid}/trigger");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineSummaryDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(UpdatePipelineTriggerRequest req, CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var cmd = new UpdatePipelineTriggerCommand(id, req.TriggerType, req.TriggerWorkspaceId, req.TriggerConfig);
        var result = await bus.InvokeAsync<Result<PipelineSummaryDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}
