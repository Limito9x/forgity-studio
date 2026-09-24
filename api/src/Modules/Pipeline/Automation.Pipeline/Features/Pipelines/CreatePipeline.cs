using Microsoft.EntityFrameworkCore;
using FluentValidation;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record CreatePipelineCommand(
    Guid ProjectId,
    string Name,
    PipelineTriggerType TriggerType = PipelineTriggerType.Manual,
    Guid? TriggerWorkspaceId = null,
    System.Text.Json.JsonDocument? TriggerConfig = null
);

public class CreatePipelineValidator : AbstractValidator<CreatePipelineCommand>
{
    public CreatePipelineValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
    }
}

public class CreatePipelineEndpoint(IMessageBus bus) : Endpoint<CreatePipelineCommand, PipelineSummaryDto>
{
    public override void Configure()
    {
        Post("");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Create);
        Description(d => d
            .Produces<PipelineSummaryDto>(200)
            .Produces(400));
    }

    public override async Task HandleAsync(CreatePipelineCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PipelineSummaryDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class CreatePipelineHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineSummaryDto>> HandleAsync(
        CreatePipelineCommand command,
        CancellationToken ct
    )
    {
        var trimmedName = command.Name.Trim();
        var exists = await db.Pipelines.AnyAsync(
            x => x.ProjectId == command.ProjectId && (x.Name == trimmedName || x.Name.ToLower() == trimmedName.ToLower()),
            ct
        );

        if (exists)
        {
            return Result.Fail<PipelineSummaryDto>($"A pipeline with name '{trimmedName}' already exists in this project.");
        }

        var pipeline = new Domain.Entities.Pipeline(
            command.ProjectId,
            trimmedName,
            command.TriggerType,
            command.TriggerWorkspaceId,
            command.TriggerConfig
        );
        db.Pipelines.Add(pipeline);

        var startNode = new PipelineNode(
            Guid.NewGuid(),
            pipeline.Id,
            "Start",
            Constants.PipelineNodeKind.Start,
            80,
            150,
            null
        );
        db.PipelineNodes.Add(startNode);

        var returnNode = new PipelineNode(
            Guid.NewGuid(),
            pipeline.Id,
            "Return",
            Constants.PipelineNodeKind.Return,
            800,
            150,
            null
        );
        db.PipelineNodes.Add(returnNode);

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
            2,
            0,
            pipeline.CreatedAt,
            pipeline.TriggerConfig
        );

        return Result.Ok(dto);
    }
}
