using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Nodes;

public record DeleteCustomNodeCommand(Guid Id);

public class DeleteCustomNodeEndpoint(IMessageBus bus)
    : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("{id:guid}");
        Group<NodesGroup>();
        Description(x => x.WithName("DeleteCustomNode"));
        Permissions(P.Pipeline.Delete);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new DeleteCustomNodeCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class DeleteCustomNodeHandler(
    PipelineDbContext db,
    IAssetApi assetApi
)
{
    public async Task<Result> HandleAsync(
        DeleteCustomNodeCommand command,
        CancellationToken ct
    )
    {
        var node = await db.NodeDefinitions
            .FirstOrDefaultAsync(x => x.Id == command.Id, ct);

        if (node == null)
        {
            return Result.Fail("Node definition not found.");
        }

        db.NodeDefinitions.Remove(node);
        await db.SaveChangesAsync(ct);

        // Remove linked script asset
        await assetApi.RemoveLinkAsync(
            ownerEntityId: node.Id.ToString(),
            ownerEntityType: "NodeDefinition",
            slotKey: PipelineAssetSlots.CustomScript,
            ct: ct
        );

        return Result.Ok();
    }
}
