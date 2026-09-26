using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record UpdatePipelineCommand(Guid Id, string Name);

public record UpdatePipelineRequest(string Name);

public class UpdatePipelineValidator : Validator<UpdatePipelineRequest>
{
    public UpdatePipelineValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Pipeline name is required.")
            .MaximumLength(100).WithMessage("Pipeline name cannot exceed 100 characters.");
    }
}

public class UpdatePipelineEndpoint(IMessageBus bus) : Endpoint<UpdatePipelineRequest, PipelineSummaryDto>
{
    public override void Configure()
    {
        Patch("{id:guid}");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineSummaryDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(UpdatePipelineRequest req, CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<PipelineSummaryDto>>(new UpdatePipelineCommand(id, req.Name), ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class UpdatePipelineHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineSummaryDto>> HandleAsync(
        UpdatePipelineCommand command,
        CancellationToken ct
    )
    {
        var trimmedName = command.Name.Trim();
        var pipeline = await db.Pipelines
            .Include(x => x.Nodes)
            .Include(x => x.Edges)
            .FirstOrDefaultAsync(x => x.Id == command.Id, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineSummaryDto>($"Pipeline '{command.Id}' not found.");
        }

        var exists = await db.Pipelines.AnyAsync(
            x => x.ProjectId == pipeline.ProjectId &&
                 x.Id != pipeline.Id &&
                 (x.Name == trimmedName || x.Name.ToLower() == trimmedName.ToLower()),
            ct
        );

        if (exists)
        {
            return Result.Fail<PipelineSummaryDto>($"A pipeline with name '{trimmedName}' already exists in this project.");
        }

        pipeline.UpdateName(trimmedName);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("IX_Pipelines_ProjectId_Name") == true || ex.Message.Contains("IX_Pipelines_ProjectId_Name"))
        {
            return Result.Fail<PipelineSummaryDto>($"A pipeline with name '{trimmedName}' already exists in this project.");
        }

        var dto = new PipelineSummaryDto(
            pipeline.Id,
            pipeline.ProjectId,
            pipeline.Name,
            pipeline.TriggerType,
            pipeline.TriggerWorkspaceId,
            pipeline.Nodes.Count,
            pipeline.Edges.Count,
            pipeline.CreatedAt
        );

        return Result.Ok(dto);
    }
}
