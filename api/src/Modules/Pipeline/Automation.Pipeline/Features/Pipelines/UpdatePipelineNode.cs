using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record UpdatePipelineNodeCommand(
    Guid PipelineId,
    Guid NodeId,
    float? PositionX = null,
    float? PositionY = null,
    Dictionary<string, object?>? ConfigValues = null
);

public record UpdatePipelineNodeRequest(
    Guid PipelineId,
    Guid NodeId,
    float? PositionX = null,
    float? PositionY = null,
    Dictionary<string, object?>? ConfigValues = null
);

public class UpdatePipelineNodeEndpoint : Endpoint<UpdatePipelineNodeRequest>
{
    public override void Configure()
    {
        Patch("{PipelineId:guid}/nodes/{NodeId:guid}");
        Group<PipelinesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(UpdatePipelineNodeRequest req, CancellationToken ct)
    {
        var command = req.Adapt<UpdatePipelineNodeCommand>();
        var result = await Resolve<IMessageBus>().InvokeAsync<Result>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class UpdatePipelineNodeHandler(
    PipelineDbContext db,
    IAssetApi assetApi
)
{
    public async Task<Result> HandleAsync(
        UpdatePipelineNodeCommand command,
        CancellationToken ct
    )
    {
        var node = await db.PipelineNodes
            .FirstOrDefaultAsync(x => x.Id == command.NodeId && x.PipelineId == command.PipelineId, ct);

        if (node == null)
        {
            return Result.Fail($"Node '{command.NodeId}' not found in Pipeline '{command.PipelineId}'.");
        }

        if (command.PositionX.HasValue && command.PositionY.HasValue)
        {
            node.Update(command.PositionX.Value, command.PositionY.Value);
        }

        if (command.ConfigValues != null)
        {
            var oldConfig = node.Config;
            JsonDocument? configDoc = command.ConfigValues.Count > 0
                ? JsonDocument.Parse(JsonSerializer.Serialize(command.ConfigValues))
                : null;

            node.UpdateConfig(configDoc);
            await PipelineAssetHelper.SyncNodeAssetsAsync(assetApi, node.Id, oldConfig, configDoc, null, ct);
        }

        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }
}
