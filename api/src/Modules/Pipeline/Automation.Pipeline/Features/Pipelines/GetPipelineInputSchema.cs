using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record GetPipelineInputSchemaQuery(Guid PipelineId);

public class GetPipelineInputSchemaEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<IReadOnlyList<PipelineInputDto>>
{
    public override void Configure()
    {
        Get("{pipelineId:guid}/input-schema");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);
        Description(d => d
            .Produces<IReadOnlyList<PipelineInputDto>>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("pipelineId");
        var query = new GetPipelineInputSchemaQuery(pipelineId);
        var result = await bus.InvokeAsync<Result<IReadOnlyList<PipelineInputDto>>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPipelineInputSchemaHandler(PipelineDbContext db)
{
    public async Task<Result<IReadOnlyList<PipelineInputDto>>> HandleAsync(
        GetPipelineInputSchemaQuery query,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<IReadOnlyList<PipelineInputDto>>($"Pipeline '{query.PipelineId}' not found.");
        }

        if (pipeline.TriggerType == Domain.Enums.PipelineTriggerType.OnResourceCreated ||
            pipeline.TriggerType == Domain.Enums.PipelineTriggerType.OnResourceVersionUpdated)
        {
            var eventInputs = new List<PipelineInputDto>
            {
                new PipelineInputDto(
                    Guid.NewGuid(),
                    "Resource",
                    "Resource",
                    Domain.Enums.PinPrimitiveType.EntityRef,
                    Domain.Enums.PinCardinality.Single,
                    true,
                    null,
                    0
                ),
                new PipelineInputDto(
                    Guid.NewGuid(),
                    "Workspace",
                    "Workspace",
                    Domain.Enums.PinPrimitiveType.EntityRef,
                    Domain.Enums.PinCardinality.Single,
                    false,
                    null,
                    1
                )
            };
            return Result.Ok<IReadOnlyList<PipelineInputDto>>(eventInputs);
        }

        var inputs = await db.PipelineInputs
            .AsNoTracking()
            .Where(x => x.PipelineId == query.PipelineId)
            .OrderBy(x => x.Order)
            .Select(i => new PipelineInputDto(
                i.Id,
                i.Key,
                i.Label,
                i.Type,
                i.Cardinality,
                i.IsRequired,
                i.DefaultValue,
                i.Order
            ))
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<PipelineInputDto>>(inputs);
    }
}
