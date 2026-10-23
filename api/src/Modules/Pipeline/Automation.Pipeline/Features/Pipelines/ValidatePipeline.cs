using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class ValidatePipelineEndpoint(IMessageBus bus) : Endpoint<ValidatePipelineQuery, ValidatePipelineResponse>
{
    public override void Configure()
    {
        Post("{pipelineId:guid}/validate");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);

        Description(d => d
            .Produces<ValidatePipelineResponse>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(ValidatePipelineQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ValidatePipelineResponse>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ValidatePipelineHandler(
    PipelineDbContext db,
    IPipelineContractValidator contractValidator
)
{
    public async Task<Result<ValidatePipelineResponse>> HandleAsync(
        ValidatePipelineQuery query,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .Include(p => p.Nodes)
            .Include(p => p.Edges)
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == query.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<ValidatePipelineResponse>($"Pipeline '{query.PipelineId}' not found.");
        }

        var validationResult = await contractValidator.ValidateGraphAsync(pipeline, ct: ct);

        var unresolvedPins = validationResult.UnresolvedPins
            .Select(u => new UnresolvedPin(
                Guid.TryParse(u.NodeId, out var parsedGuid) ? parsedGuid : Guid.Empty,
                u.NodeLabel,
                u.PinName,
                u.PinName,
                Domain.Enums.PinPrimitiveType.String,
                "Unresolved required input pin"
            ))
            .ToList();

        return Result.Ok(new ValidatePipelineResponse(
            validationResult.IsValid,
            validationResult.CycleNodeIds,
            unresolvedPins,
            validationResult.Diagnostics
        ));
    }
}
