using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Features.Nodes.Events;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Nodes;

public record BatchUpsertItem(
    string Key,
    string Name,
    string? Label,
    string? Executor,
    string? ContentHash,
    string? OriginalFileName,
    Guid? AssetId,
    List<PinDefinition>? Inputs,
    List<PinDefinition>? Outputs,
    EdgeReconciliationStrategy Strategy = EdgeReconciliationStrategy.KeepCompatiblePins
);

public record BatchUpsertCustomNodesCommand(
    Guid ProjectId,
    List<BatchUpsertItem> Items
);

public record BatchUpsertResultItemDto(
    Guid Id,
    string Key,
    string Name,
    string Executor,
    bool IsUpdated,
    int InputCount,
    int OutputCount
);

public record BatchUpsertCustomNodesResponseDto(
    IReadOnlyList<BatchUpsertResultItemDto> Results
);

public class BatchUpsertCustomNodesValidator : AbstractValidator<BatchUpsertCustomNodesCommand>
{
    public BatchUpsertCustomNodesValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty().WithMessage("At least one item must be provided.");
    }
}

public class BatchUpsertCustomNodesEndpoint(IMessageBus bus)
    : Endpoint<BatchUpsertCustomNodesCommand, BatchUpsertCustomNodesResponseDto>
{
    public override void Configure()
    {
        Post("custom/batch-upsert");
        Group<NodesGroup>();
        Description(x => x.WithName("BatchUpsertCustomNodes"));
        Permissions(P.Pipeline.Create, P.Pipeline.Update);
    }

    public override async Task HandleAsync(BatchUpsertCustomNodesCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<BatchUpsertCustomNodesResponseDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class BatchUpsertCustomNodesHandler(
    PipelineDbContext db,
    IAssetApi assetApi,
    IMessageBus bus
)
{
    public async Task<Result<BatchUpsertCustomNodesResponseDto>> HandleAsync(
        BatchUpsertCustomNodesCommand command,
        CancellationToken ct
    )
    {
        var existingNodes = await db.NodeDefinitions
            .Where(x => x.ProjectId == command.ProjectId)
            .ToListAsync(ct);

        var results = new List<BatchUpsertResultItemDto>();

        foreach (var item in command.Items)
        {
            var nameTrimmed = item.Name.Trim();
            var key = string.IsNullOrWhiteSpace(item.Key)
                ? nameTrimmed.Replace(" ", "-").ToLowerInvariant()
                : item.Key.Trim().ToLowerInvariant();

            var label = string.IsNullOrWhiteSpace(item.Label) ? nameTrimmed : item.Label.Trim();
            var executor = string.IsNullOrWhiteSpace(item.Executor) ? "blender" : item.Executor.Trim().ToLowerInvariant();

            var sanitizedInputs = (item.Inputs ?? []).Select(p => new PinDefinition
            {
                Id = p.Id,
                Label = string.IsNullOrWhiteSpace(p.Label) ? p.Id : p.Label,
                PrimitiveType = p.PrimitiveType,
                Cardinality = p.Cardinality,
                IsRequired = p.IsRequired,
                DefaultValue = p.DefaultValue?.ToString(),
                Metadata = p.Metadata
            }).ToList();

            var sanitizedOutputs = (item.Outputs ?? []).Select(p => new PinDefinition
            {
                Id = p.Id,
                Label = string.IsNullOrWhiteSpace(p.Label) ? p.Id : p.Label,
                PrimitiveType = p.PrimitiveType,
                Cardinality = p.Cardinality,
                IsRequired = p.IsRequired,
                DefaultValue = p.DefaultValue?.ToString(),
                Metadata = p.Metadata
            }).ToList();

            var existingNode = existingNodes.FirstOrDefault(x =>
                x.Key.Equals(key, StringComparison.OrdinalIgnoreCase) ||
                x.Name.Equals(nameTrimmed, StringComparison.OrdinalIgnoreCase));

            if (existingNode != null)
            {
                var oldInputPinIds = existingNode.Inputs.Select(p => p.Id).ToList();
                var oldOutputPinIds = existingNode.Outputs.Select(p => p.Id).ToList();

                existingNode.Update(nameTrimmed, label, executor, sanitizedInputs, sanitizedOutputs);
                if (!string.IsNullOrWhiteSpace(item.ContentHash))
                {
                    existingNode.UpdateContent(item.ContentHash, existingNode.SemanticVersion, sanitizedInputs, sanitizedOutputs);
                    existingNode.SetStatus(NodeLifecycleStatus.Published);
                }

                // Link asset script if provided
                if (item.AssetId.HasValue && item.AssetId.Value != Guid.Empty)
                {
                    await assetApi.RemoveLinkAsync(
                        ownerEntityId: existingNode.Id.ToString(),
                        ownerEntityType: "NodeDefinition",
                        slotKey: PipelineAssetSlots.CustomScript,
                        ct: ct
                    );

                    var fileName = string.IsNullOrWhiteSpace(item.OriginalFileName) ? $"{existingNode.Key}.py" : item.OriginalFileName;
                    await assetApi.VerifyAndLinkAsync(
                        item.AssetId.Value,
                        ownerEntityType: "NodeDefinition",
                        slotKey: PipelineAssetSlots.CustomScript,
                        ownerEntityId: existingNode.Id.ToString(),
                        originalName: fileName,
                        sortOrder: 0,
                        ct: ct
                    );
                }

                // Publish reconciliation event for edge cleanup
                var newInputPinIds = existingNode.Inputs.Select(p => p.Id).ToList();
                var newOutputPinIds = existingNode.Outputs.Select(p => p.Id).ToList();

                await bus.PublishAsync(new NodeDefinitionPinsChangedEvent(
                    NodeDefinitionId: existingNode.Id,
                    NodeKey: existingNode.Key,
                    ProjectId: existingNode.ProjectId,
                    OldInputPinIds: oldInputPinIds,
                    OldOutputPinIds: oldOutputPinIds,
                    NewInputPinIds: newInputPinIds,
                    NewOutputPinIds: newOutputPinIds,
                    Strategy: item.Strategy
                ));

                results.Add(new BatchUpsertResultItemDto(
                    existingNode.Id,
                    existingNode.Key,
                    existingNode.Name,
                    existingNode.Executor,
                    true,
                    sanitizedInputs.Count,
                    sanitizedOutputs.Count
                ));
            }
            else
            {
                var newNode = new NodeDefinition(
                    command.ProjectId,
                    nameTrimmed,
                    key,
                    label,
                    executor,
                    sanitizedInputs,
                    sanitizedOutputs
                );

                if (!string.IsNullOrWhiteSpace(item.ContentHash))
                {
                    newNode.UpdateContent(item.ContentHash, "1.0.0", sanitizedInputs, sanitizedOutputs);
                    newNode.SetStatus(NodeLifecycleStatus.Published);
                }

                db.NodeDefinitions.Add(newNode);
                await db.SaveChangesAsync(ct);

                if (item.AssetId.HasValue && item.AssetId.Value != Guid.Empty)
                {
                    var fileName = string.IsNullOrWhiteSpace(item.OriginalFileName) ? $"{newNode.Key}.py" : item.OriginalFileName;
                    await assetApi.VerifyAndLinkAsync(
                        item.AssetId.Value,
                        ownerEntityType: "NodeDefinition",
                        slotKey: PipelineAssetSlots.CustomScript,
                        ownerEntityId: newNode.Id.ToString(),
                        originalName: fileName,
                        sortOrder: 0,
                        ct: ct
                    );
                }

                results.Add(new BatchUpsertResultItemDto(
                    newNode.Id,
                    newNode.Key,
                    newNode.Name,
                    newNode.Executor,
                    false,
                    sanitizedInputs.Count,
                    sanitizedOutputs.Count
                ));
            }
        }

        await db.SaveChangesAsync(ct);
        return Result.Ok(new BatchUpsertCustomNodesResponseDto(results));
    }
}
