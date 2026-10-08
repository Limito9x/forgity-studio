using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Nodes;

public record CreateCustomNodeCommand(
    Guid ProjectId,
    string Name,
    string? Label,
    string? Executor,
    Guid? AssetId,
    string? OriginalFileName,
    List<PinDefinition>? Inputs,
    List<PinDefinition>? Outputs,
    string? ContentHash = null
);

public class CreateCustomNodeValidator : AbstractValidator<CreateCustomNodeCommand>
{
    public CreateCustomNodeValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.AssetId).NotEmpty().WithMessage("Upload and confirm the script before publishing.");
        RuleFor(x => x.OriginalFileName).NotEmpty()
            .Must(f => f != null && f.EndsWith(".py", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Script must have a Python (.py) filename.");
    }
}

public class CreateCustomNodeEndpoint(IMessageBus bus)
    : Endpoint<CreateCustomNodeCommand, CreateCustomNodeResponseDto>
{
    public override void Configure()
    {
        Post("custom");
        Group<NodesGroup>();
        Description(x => x.WithName("CreateCustomNode"));
        Permissions(P.Pipeline.Create);
    }

    public override async Task HandleAsync(CreateCustomNodeCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<CreateCustomNodeResponseDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class CreateCustomNodeHandler(
    PipelineDbContext db,
    IAssetApi assets
)
{
    public async Task<Result<CreateCustomNodeResponseDto>> HandleAsync(
        CreateCustomNodeCommand command,
        CancellationToken ct
    )
    {
        if (command.AssetId is null || command.AssetId == Guid.Empty)
            return Result.Fail<CreateCustomNodeResponseDto>("Upload and confirm the script before publishing.");

        if (string.IsNullOrWhiteSpace(command.OriginalFileName) || !command.OriginalFileName.EndsWith(".py", StringComparison.OrdinalIgnoreCase) ||
            command.OriginalFileName.IndexOfAny(['/', '\\', ':', '<', '>', '"', '|', '?', '*']) >= 0)
            return Result.Fail<CreateCustomNodeResponseDto>("Script must have a Python (.py) filename without directories.");

        var key = command.Name.Trim().Replace(" ", "-").ToLowerInvariant();
        var existing = await db.NodeDefinitions.FirstOrDefaultAsync(x => x.ProjectId == command.ProjectId && x.Key == key, ct);
        if (existing != null)
        {
            return Result.Fail<CreateCustomNodeResponseDto>($"A node definition with key '{key}' already exists in this project.");
        }

        var node = new NodeDefinition
        {
            ProjectId = command.ProjectId,
            Key = key
        };

        node.Update(
            command.Name.Trim(),
            string.IsNullOrWhiteSpace(command.Label) ? command.Name.Trim() : command.Label.Trim(),
            string.IsNullOrWhiteSpace(command.Executor) ? "blender" : command.Executor.Trim().ToLowerInvariant(),
            SanitizePins(command.Inputs),
            SanitizePins(command.Outputs)
        );

        db.NodeDefinitions.Add(node);
        await db.SaveChangesAsync(ct);

        var owner = new AssetLinkOwner(nameof(NodeDefinition), node.Id.ToString(), PipelineAssetSlots.CustomScript);
        var linked = await assets.ReplaceSingleLinkAsync(new(command.AssetId.Value, command.OriginalFileName), owner, command.ContentHash, ct);
        if (linked.IsFailed)
        {
            return Result.Fail<CreateCustomNodeResponseDto>(linked.Errors);
        }

        node.ContentHash = linked.Value.HashSha256;
        node.Status = NodeLifecycleStatus.Published;
        await db.SaveChangesAsync(ct);

        var dto = node.Adapt<CreateCustomNodeResponseDto>() with
        {
            ScriptAssetLinkId = linked.Value.AssetLinkId,
            ContentHash = linked.Value.HashSha256,
            AssetId = linked.Value.AssetId,
            OriginalFileName = linked.Value.OriginalName
        };

        return Result.Ok(dto);
    }

    private static List<PinDefinition> SanitizePins(List<PinDefinition>? pins) =>
        (pins ?? []).Select(p => p with { Label = string.IsNullOrWhiteSpace(p.Label) ? p.Id : p.Label }).ToList();
}

public record CreateCustomNodeResponseDto(
    Guid Id,
    Guid ProjectId,
    string Name,
    string Key,
    string Label,
    string Executor,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    DateTimeOffset CreatedAt,
    Guid? ScriptAssetLinkId = null,
    string? ContentHash = null,
    Guid? AssetId = null,
    string? OriginalFileName = null
);
