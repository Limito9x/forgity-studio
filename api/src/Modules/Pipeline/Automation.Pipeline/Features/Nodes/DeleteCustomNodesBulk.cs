using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Nodes;

public record DeleteCustomNodesBulkCommand(
    Guid ProjectId,
    List<Guid> Ids
);

public record DeleteCustomNodesBulkResult(
    List<Guid> Deleted,
    List<Guid> NotFound
);

public class DeleteCustomNodesBulkValidator : AbstractValidator<DeleteCustomNodesBulkCommand>
{
    public DeleteCustomNodesBulkValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Ids)
            .NotNull()
            .Must(ids => ids.Count >= 1 && ids.Count <= 100)
            .WithMessage("Ids must contain 1 to 100 entries.");
    }
}

public class DeleteCustomNodesBulkEndpoint(IMessageBus bus)
    : Endpoint<DeleteCustomNodesBulkCommand, DeleteCustomNodesBulkResult>
{
    public override void Configure()
    {
        Post("custom/bulk-delete");
        Group<NodesGroup>();
        Description(x => x.WithName("DeleteCustomNodesBulk"));
        Permissions(P.Pipeline.Delete);
    }

    public override async Task HandleAsync(DeleteCustomNodesBulkCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<DeleteCustomNodesBulkResult>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class DeleteCustomNodesBulkHandler(
    PipelineDbContext db,
    IAssetApi assetApi
)
{
    public async Task<Result<DeleteCustomNodesBulkResult>> HandleAsync(
        DeleteCustomNodesBulkCommand command,
        CancellationToken ct
    )
    {
        var distinctIds = command.Ids.Distinct().ToList();

        // Only Custom nodes live in NodeDefinitions — BuiltIn (ToolRegistry)
        // and SubPipeline (Pipelines table) can never match here, so they
        // are inherently blocked from bulk delete.
        var nodes = await db.NodeDefinitions
            .Where(x => distinctIds.Contains(x.Id) && x.ProjectId == command.ProjectId)
            .ToListAsync(ct);

        var foundIds = nodes.Select(x => x.Id).ToHashSet();
        var notFound = distinctIds.Where(id => !foundIds.Contains(id)).ToList();

        if (nodes.Count > 0)
        {
            db.NodeDefinitions.RemoveRange(nodes);
            await db.SaveChangesAsync(ct);

            foreach (var node in nodes)
            {
                await assetApi.RemoveLinkAsync(
                    ownerEntityId: node.Id.ToString(),
                    ownerEntityType: "NodeDefinition",
                    slotKey: PipelineAssetSlots.CustomScript,
                    ct: ct
                );
            }
        }

        return Result.Ok(new DeleteCustomNodesBulkResult(
            nodes.Select(x => x.Id).ToList(),
            notFound
        ));
    }
}
