using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.UpdatePipelineOutput;

public record UpdatePipelineOutputCommand(
    Guid PipelineId,
    Guid OutputId,
    string Key,
    string Label,
    string Type,
    string Cardinality = "Single",
    int Order = 0
);

public class UpdatePipelineOutputValidator : AbstractValidator<UpdatePipelineOutputCommand>
{
    public UpdatePipelineOutputValidator()
    {
        RuleFor(x => x.PipelineId).NotEmpty();
        RuleFor(x => x.OutputId).NotEmpty();
        RuleFor(x => x.Key).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Label).NotEmpty().MaximumLength(200);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class UpdatePipelineOutputHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineOutputDto>> HandleAsync(
        UpdatePipelineOutputCommand command,
        CancellationToken ct
    )
    {
        var output = await db.PipelineOutputs.FirstOrDefaultAsync(
            x => x.Id == command.OutputId && x.PipelineId == command.PipelineId,
            ct
        );

        if (output == null)
        {
            return Result.Fail<PipelineOutputDto>($"Pipeline output with ID '{command.OutputId}' not found.");
        }

        var key = command.Key.Trim();
        if (string.IsNullOrWhiteSpace(key))
        {
            return Result.Fail<PipelineOutputDto>("Output key cannot be empty.");
        }

        var keyExists = await db.PipelineOutputs.AsNoTracking().AnyAsync(
            x => x.PipelineId == command.PipelineId && x.Id != command.OutputId && x.Key.ToLower() == key.ToLower(),
            ct
        );
        if (keyExists)
        {
            return Result.Fail<PipelineOutputDto>($"Output key '{key}' already exists in this pipeline.");
        }

        if (!Enum.TryParse<PinPrimitiveType>(command.Type, true, out var pinType))
        {
            pinType = PinPrimitiveType.String;
        }

        if (!Enum.TryParse<PinCardinality>(command.Cardinality, true, out var cardinality))
        {
            cardinality = PinCardinality.Single;
        }

        var label = string.IsNullOrWhiteSpace(command.Label) ? key : command.Label.Trim();

        output.Update(
            key,
            label,
            pinType,
            cardinality,
            command.Order
        );

        await db.SaveChangesAsync(ct);

        var dto = new PipelineOutputDto(
            output.Id,
            output.Key,
            output.Label,
            output.Type,
            output.Cardinality,
            output.Order
        );

        return Result.Ok(dto);
    }
}

public class UpdatePipelineOutputEndpoint(IMessageBus bus) : Endpoint<UpdatePipelineOutputCommand, PipelineOutputDto>
{
    public override void Configure()
    {
        Put("{pipelineId:guid}/outputs/{outputId:guid}");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineOutputDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(UpdatePipelineOutputCommand req, CancellationToken ct)
    {
        var pipelineId = Route<Guid>("pipelineId");
        var outputId = Route<Guid>("outputId");
        var cmd = req with { PipelineId = pipelineId, OutputId = outputId };
        var result = await bus.InvokeAsync<Result<PipelineOutputDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}
