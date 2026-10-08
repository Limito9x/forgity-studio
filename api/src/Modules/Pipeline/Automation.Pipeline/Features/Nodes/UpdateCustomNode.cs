using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Features.Nodes.Events;
using Automation.Pipeline.Infrastructure.Persistence;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Nodes;

public record UpdateCustomNodeCommand(
    Guid Id,
    string Name,
    string? Label,
    string? Executor,
    Guid? AssetId,
    string? OriginalFileName,
    List<PinDefinition>? Inputs,
    List<PinDefinition>? Outputs,
    EdgeReconciliationStrategy EdgeReconciliationStrategy = EdgeReconciliationStrategy.KeepCompatiblePins,
    string? ContentHash = null
);

public record UpdateCustomNodeRequest(
    string Name,
    string? Label,
    string? Executor,
    Guid? AssetId,
    string? OriginalFileName,
    List<PinDefinition>? Inputs,
    List<PinDefinition>? Outputs,
    EdgeReconciliationStrategy EdgeReconciliationStrategy = EdgeReconciliationStrategy.KeepCompatiblePins,
    string? ContentHash = null
);

public class UpdateCustomNodeEndpoint(IMessageBus bus)
    : Endpoint<UpdateCustomNodeRequest, CreateCustomNodeResponseDto>
{
    public override void Configure()
    {
        Put("custom/{Id:guid}");
        Group<NodesGroup>();
        Description(x => x.WithName("UpdateCustomNode"));
        Permissions(P.Pipeline.Update);
    }

    public override async Task HandleAsync(UpdateCustomNodeRequest req, CancellationToken ct)
    {
        var id = Route<Guid>("Id");
        var cmd = new UpdateCustomNodeCommand(
            id,
            req.Name,
            req.Label,
            req.Executor,
            req.AssetId,
            req.OriginalFileName,
            req.Inputs,
            req.Outputs,
            req.EdgeReconciliationStrategy,
            req.ContentHash
        );

        var result = await bus.InvokeAsync<Result<CreateCustomNodeResponseDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class UpdateCustomNodeHandler(
    PipelineDbContext db,
    IAssetApi assets,
    IMessageBus bus
)
{
    public async Task<Result<CreateCustomNodeResponseDto>> HandleAsync(
        UpdateCustomNodeCommand command,
        CancellationToken ct
    )
    {
        var node = await db.NodeDefinitions.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (node == null)
        {
            return Result.Fail<CreateCustomNodeResponseDto>("Custom node not found.");
        }

        var hasUpload = command.AssetId.HasValue && command.AssetId.Value != Guid.Empty;
        var owner = new AssetLinkOwner(nameof(NodeDefinition), node.Id.ToString(), PipelineAssetSlots.CustomScript);
        AssetLinkDto? file = null;

        if (hasUpload)
        {
            if (string.IsNullOrWhiteSpace(command.OriginalFileName) || !command.OriginalFileName.EndsWith(".py", StringComparison.OrdinalIgnoreCase) ||
                command.OriginalFileName.IndexOfAny(['/', '\\', ':', '<', '>', '"', '|', '?', '*']) >= 0)
                return Result.Fail<CreateCustomNodeResponseDto>("Script must have a Python (.py) filename without directories.");
        }
        else
        {
            var current = await assets.GetFilesAsync(owner.EntityId, owner.EntityType, owner.SlotKey, ct);
            if (current.IsFailed) return Result.Fail<CreateCustomNodeResponseDto>(current.Errors);
            if (current.Value.Count != 1) return Result.Fail<CreateCustomNodeResponseDto>("Upload a script before publishing this definition.");
            file = current.Value[0];
        }

        var oldInputs = node.Inputs.Select(p => p.Id).ToList();
        var oldOutputs = node.Outputs.Select(p => p.Id).ToList();

        node.Update(
            command.Name.Trim(),
            string.IsNullOrWhiteSpace(command.Label) ? command.Name.Trim() : command.Label.Trim(),
            string.IsNullOrWhiteSpace(command.Executor) ? "blender" : command.Executor.Trim().ToLowerInvariant(),
            SanitizePins(command.Inputs),
            SanitizePins(command.Outputs)
        );

        if (hasUpload)
        {
            var linked = await assets.ReplaceSingleLinkAsync(new(command.AssetId!.Value, command.OriginalFileName!), owner, command.ContentHash, ct);
            if (linked.IsFailed) return Result.Fail<CreateCustomNodeResponseDto>(linked.Errors);
            file = linked.Value;
        }

        node.ContentHash = file!.HashSha256;
        node.Status = NodeLifecycleStatus.Published;
        await db.SaveChangesAsync(ct);

        await bus.PublishAsync(new NodeDefinitionPinsChangedEvent(
            node.Id,
            node.Key,
            node.ProjectId,
            oldInputs,
            oldOutputs,
            node.Inputs.Select(p => p.Id).ToList(),
            node.Outputs.Select(p => p.Id).ToList(),
            command.EdgeReconciliationStrategy
        ));

        var dto = node.Adapt<CreateCustomNodeResponseDto>() with
        {
            ScriptAssetLinkId = file.AssetLinkId,
            ContentHash = file.HashSha256,
            AssetId = file.AssetId,
            OriginalFileName = file.OriginalName
        };

        return Result.Ok(dto);
    }

    private static List<PinDefinition> SanitizePins(List<PinDefinition>? pins) =>
        (pins ?? []).Select(p => p with { Label = string.IsNullOrWhiteSpace(p.Label) ? p.Id : p.Label }).ToList();
}
