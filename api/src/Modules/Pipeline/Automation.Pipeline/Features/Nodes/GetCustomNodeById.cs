using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Nodes;

public record GetCustomNodeByIdQuery(Guid Id);

public class GetCustomNodeByIdEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<CreateCustomNodeResponseDto>
{
    public override void Configure()
    {
        Get("custom/{Id:guid}");
        Group<NodesGroup>();
        Description(x => x.WithName("GetCustomNodeById"));
        Permissions(P.Pipeline.GetById);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("Id");
        var query = new GetCustomNodeByIdQuery(id);
        var result = await bus.InvokeAsync<Result<CreateCustomNodeResponseDto>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetCustomNodeByIdHandler(PipelineDbContext db)
{
    public async Task<Result<CreateCustomNodeResponseDto>> HandleAsync(
        GetCustomNodeByIdQuery query,
        CancellationToken ct
    )
    {
        var node = await db.NodeDefinitions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (node == null)
        {
            return Result.Fail<CreateCustomNodeResponseDto>("Custom node not found.");
        }

        return Result.Ok(new CreateCustomNodeResponseDto(
            node.Id,
            node.ProjectId,
            node.Name,
            node.Key,
            node.Label,
            node.Executor,
            node.Inputs,
            node.Outputs,
            node.CreatedAt
        ));
    }
}
