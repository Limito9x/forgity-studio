using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.AddPipelineOutput;

public record AddPipelineOutputCommand(
    Guid PipelineId,
    string Key,
    string Label,
    string Type,
    string Cardinality = "Single",
    int Order = 0
);

public class AddPipelineOutputValidator : AbstractValidator<AddPipelineOutputCommand>
{
    public AddPipelineOutputValidator()
    {
        RuleFor(x => x.PipelineId).NotEmpty();
        RuleFor(x => x.Key).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Label).NotEmpty().MaximumLength(200);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class AddPipelineOutputHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineOutputDto>> HandleAsync(
        AddPipelineOutputCommand command,
        CancellationToken ct
    )
    {
        var pipelineExists = await db.Pipelines.AsNoTracking().AnyAsync(x => x.Id == command.PipelineId, ct);
        if (!pipelineExists)
        {
            return Result.Fail<PipelineOutputDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        var key = command.Key.Trim();
        if (string.IsNullOrWhiteSpace(key))
        {
            return Result.Fail<PipelineOutputDto>("Output key cannot be empty.");
        }

        var keyExists = await db.PipelineOutputs.AsNoTracking().AnyAsync(
            x => x.PipelineId == command.PipelineId && x.Key.ToLower() == key.ToLower(),
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
        var order = command.Order;
        if (order == 0)
        {
            var maxOrder = await db.PipelineOutputs
                .Where(x => x.PipelineId == command.PipelineId)
                .Select(x => (int?)x.Order)
                .MaxAsync(ct) ?? 0;
            order = maxOrder + 1;
        }

        var output = new PipelineOutput(
            command.PipelineId,
            key,
            label,
            pinType,
            cardinality,
            order
        );

        await db.PipelineOutputs.AddAsync(output, ct);
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

public class AddPipelineOutputEndpoint(IMessageBus bus) : Endpoint<AddPipelineOutputCommand, PipelineOutputDto>
{
    public override void Configure()
    {
        Post("{pipelineId:guid}/outputs");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineOutputDto>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(AddPipelineOutputCommand req, CancellationToken ct)
    {
        var pipelineId = Route<Guid>("pipelineId");
        var cmd = req with { PipelineId = pipelineId };
        var result = await bus.InvokeAsync<Result<PipelineOutputDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}
