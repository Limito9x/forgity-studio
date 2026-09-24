using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record UpdatePipelineInputCommand(
    Guid PipelineId,
    Guid InputId,
    string? Key = null,
    string? Label = null,
    string? Type = null,
    string? Cardinality = null,
    bool? IsRequired = null,
    string? DefaultValue = null,
    int? Order = null
);

public record UpdatePipelineInputRequest(
    Guid PipelineId,
    Guid InputId,
    string? Key = null,
    string? Label = null,
    string? Type = null,
    string? Cardinality = null,
    bool? IsRequired = null,
    string? DefaultValue = null,
    int? Order = null
);

public class UpdatePipelineInputEndpoint : Endpoint<UpdatePipelineInputRequest, PipelineInputDto>
{
    public override void Configure()
    {
        Patch("{PipelineId:guid}/inputs/{InputId:guid}");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
    }

    public override async Task HandleAsync(UpdatePipelineInputRequest req, CancellationToken ct)
    {
        var command = req.Adapt<UpdatePipelineInputCommand>();
        var result = await Resolve<IMessageBus>().InvokeAsync<Result<PipelineInputDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class UpdatePipelineInputHandler(PipelineDbContext db)
{
    public async Task<Result<PipelineInputDto>> HandleAsync(
        UpdatePipelineInputCommand command,
        CancellationToken ct
    )
    {
        var input = await db.PipelineInputs
            .FirstOrDefaultAsync(x => x.Id == command.InputId && x.PipelineId == command.PipelineId, ct);

        if (input == null)
        {
            return Result.Fail<PipelineInputDto>($"Pipeline input '{command.InputId}' not found.");
        }

        var key = input.Key;
        if (!string.IsNullOrWhiteSpace(command.Key))
        {
            key = command.Key.Trim();
            if (!string.Equals(key, input.Key, StringComparison.OrdinalIgnoreCase))
            {
                var keyExists = await db.PipelineInputs.AsNoTracking().AnyAsync(
                    x => x.PipelineId == command.PipelineId && x.Id != command.InputId && x.Key.ToLower() == key.ToLower(),
                    ct
                );
                if (keyExists)
                {
                    return Result.Fail<PipelineInputDto>($"Input key '{key}' already exists in this pipeline.");
                }
            }
        }

        var label = command.Label != null ? command.Label.Trim() : input.Label;
        var type = input.Type;
        if (!string.IsNullOrWhiteSpace(command.Type) && Enum.TryParse<PinPrimitiveType>(command.Type, true, out var parsedType))
        {
            type = parsedType;
        }

        var cardinality = input.Cardinality;
        if (!string.IsNullOrWhiteSpace(command.Cardinality) && Enum.TryParse<PinCardinality>(command.Cardinality, true, out var parsedCard))
        {
            cardinality = parsedCard;
        }

        var isRequired = command.IsRequired ?? input.IsRequired;
        var defaultValue = command.DefaultValue ?? input.DefaultValue;
        var order = command.Order ?? input.Order;

        input.Update(
            key,
            label,
            type,
            cardinality,
            isRequired,
            defaultValue,
            order
        );

        await db.SaveChangesAsync(ct);

        var dto = new PipelineInputDto(
            input.Id,
            input.Key,
            input.Label,
            input.Type,
            input.Cardinality,
            input.IsRequired,
            input.DefaultValue,
            input.Order
        );

        return Result.Ok(dto);
    }
}
