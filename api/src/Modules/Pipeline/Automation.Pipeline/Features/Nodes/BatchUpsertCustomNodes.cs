using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Features.Nodes.Events;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;

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

public record BatchUpsertErrorDto(string Key, string? FileName, string Message);
public record BatchUpsertCustomNodesResponseDto(
    IReadOnlyList<BatchUpsertResultItemDto> Results,
    IReadOnlyList<BatchUpsertErrorDto> Errors
);

public class BatchUpsertCustomNodesValidator : AbstractValidator<BatchUpsertCustomNodesCommand>
{
    public BatchUpsertCustomNodesValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty().WithMessage("At least one item must be provided.");
        RuleFor(x => x.Items).Must(x => x == null || x.Count <= 100).WithMessage("A batch can contain at most 100 scripts.");
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

[NonTransactional] // Batch iterates items, individual items commit their definition and link.
public class BatchUpsertCustomNodesHandler(
    PipelineDbContext db,
    IAssetApi assets,
    IMessageBus bus,
    ILogger<BatchUpsertCustomNodesHandler> logger
)
{
    public static string NormalizeKey(BatchUpsertItem item) =>
        (string.IsNullOrWhiteSpace(item.Key) ? item.Name?.Trim().Replace(" ", "-") : item.Key.Trim())?.ToLowerInvariant() ?? "";

    public async Task<Result<BatchUpsertCustomNodesResponseDto>> HandleAsync(
        BatchUpsertCustomNodesCommand command,
        CancellationToken ct
    )
    {
        var results = new List<BatchUpsertResultItemDto>();
        var errors = new List<BatchUpsertErrorDto>();
        var duplicates = command.Items.GroupBy(NormalizeKey)
            .Where(g => g.Count() > 1).Select(g => g.Key).ToHashSet();

        foreach (var item in command.Items)
        {
            var key = NormalizeKey(item);
            if (duplicates.Contains(key) || item.AssetId is null || item.AssetId == Guid.Empty)
            {
                errors.Add(new(key, item.OriginalFileName, duplicates.Contains(key)
                    ? "Duplicate node key in this batch." : "Upload and confirm the script before publishing."));
                continue;
            }

            var validationError = Validate(item);
            if (validationError != null)
            {
                errors.Add(new(key, item.OriginalFileName, validationError));
                continue;
            }

            try
            {
                var upsertResult = await UpsertSingleNodeAsync(command.ProjectId, key, item, ct);
                if (upsertResult.IsFailed)
                {
                    errors.Add(new(key, item.OriginalFileName, upsertResult.Errors.First().Message));
                    continue;
                }

                var (node, isUpdated) = upsertResult.Value;
                results.Add(new(node.Id, node.Key, node.Name, node.Executor, isUpdated, node.Inputs.Count, node.Outputs.Count));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                db.ChangeTracker.Clear();
                logger.LogError(ex, "Failed to publish script {FileName} ({Key})", item.OriginalFileName, key);
                errors.Add(new(key, item.OriginalFileName, "Could not publish this script. Please retry."));
            }
        }

        return Result.Ok(new BatchUpsertCustomNodesResponseDto(results, errors));
    }

    private async Task<Result<(NodeDefinition Node, bool IsUpdated)>> UpsertSingleNodeAsync(
        Guid projectId,
        string key,
        BatchUpsertItem item,
        CancellationToken ct
    )
    {
        var node = await db.NodeDefinitions.FirstOrDefaultAsync(x => x.ProjectId == projectId && x.Key == key, ct);
        var isUpdated = node != null;
        node ??= new NodeDefinition { ProjectId = projectId, Key = key };

        var oldInputs = node.Inputs.Select(p => p.Id).ToList();
        var oldOutputs = node.Outputs.Select(p => p.Id).ToList();

        node.Update(
            item.Name.Trim(),
            string.IsNullOrWhiteSpace(item.Label) ? item.Name.Trim() : item.Label.Trim(),
            string.IsNullOrWhiteSpace(item.Executor) ? "blender" : item.Executor.Trim().ToLowerInvariant(),
            SanitizePins(item.Inputs),
            SanitizePins(item.Outputs)
        );

        if (!isUpdated) db.NodeDefinitions.Add(node);
        await db.SaveChangesAsync(ct);

        var owner = new AssetLinkOwner(nameof(NodeDefinition), node.Id.ToString(), PipelineAssetSlots.CustomScript);
        var linked = await assets.ReplaceSingleLinkAsync(new(item.AssetId!.Value, item.OriginalFileName!), owner, item.ContentHash, ct);
        if (linked.IsFailed)
        {
            db.ChangeTracker.Clear();
            return Result.Fail<(NodeDefinition, bool)>(linked.Errors);
        }

        node.ContentHash = linked.Value.HashSha256;
        node.Status = NodeLifecycleStatus.Published;
        await db.SaveChangesAsync(ct);

        if (isUpdated)
        {
            await bus.PublishAsync(new NodeDefinitionPinsChangedEvent(
                node.Id, node.Key, node.ProjectId, oldInputs, oldOutputs,
                node.Inputs.Select(p => p.Id).ToList(), node.Outputs.Select(p => p.Id).ToList(), item.Strategy
            ));
        }

        return Result.Ok((node, isUpdated));
    }

    private static List<PinDefinition> SanitizePins(List<PinDefinition>? pins) =>
        (pins ?? []).Select(p => p with { Label = string.IsNullOrWhiteSpace(p.Label) ? p.Id : p.Label }).ToList();

    private static string? Validate(BatchUpsertItem item)
    {
        if (string.IsNullOrWhiteSpace(item.Name) || item.Name.Trim().Length > 100)
            return "A node name of at most 100 characters is required.";
        if (item.AssetId is { } assetId && assetId != Guid.Empty)
        {
            if (string.IsNullOrWhiteSpace(item.OriginalFileName) || !item.OriginalFileName.EndsWith(".py", StringComparison.OrdinalIgnoreCase) ||
                item.OriginalFileName.IndexOfAny(['/', '\\', ':', '<', '>', '"', '|', '?', '*']) >= 0)
                return "Script must have a Python (.py) filename without directories.";
            if (!string.IsNullOrEmpty(item.ContentHash) && (item.ContentHash.Length != 64 || !item.ContentHash.All(Uri.IsHexDigit)))
                return "Script hash must be a SHA-256 hash.";
        }
        foreach (var pins in new[] { item.Inputs, item.Outputs })
            if (pins != null && (pins.Any(p => string.IsNullOrWhiteSpace(p.Id)) ||
                pins.Select(p => p.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count() != pins.Count))
                return "Pin IDs must be non-empty and unique within each direction.";
        return null;
    }
}
