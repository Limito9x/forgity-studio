using Automation.Workspace.Constants;
using Automation.Workspace.Infrastructure.Persistence;
using FastEndpoints;
using FluentResults;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Resources;

// 1. Command & Validator
public record AssignResourcesContentCommand(
    List<Guid> ResourceIds,
    Guid? ContentId
);

public class AssignResourcesContentValidator : AbstractValidator<AssignResourcesContentCommand>
{
    public AssignResourcesContentValidator()
    {
        RuleFor(x => x.ResourceIds)
            .NotEmpty()
            .WithMessage("ResourceIds cannot be empty.");
    }
}

// 2. Endpoint
public class AssignResourcesContentEndpoint(IMessageBus bus)
    : Endpoint<AssignResourcesContentCommand>
{
    public override void Configure()
    {
        Put(WorkspaceRoutes.AssignResourcesContent);
        Group<ResourcesGroup>();
        Permissions(P.Resource.Update);
        Description(x => x.WithName("AssignResourcesContent"));
    }

    public override async Task HandleAsync(AssignResourcesContentCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[Transactional(typeof(WorkspaceDbContext))]
public class AssignResourcesContentHandler(WorkspaceDbContext db)
{
    public async Task<Result> HandleAsync(
        AssignResourcesContentCommand command,
        CancellationToken ct
    )
    {
        if (command.ResourceIds == null || command.ResourceIds.Count == 0)
        {
            return Result.Ok();
        }

        var resources = await db.ResourceItems
            .Where(r => command.ResourceIds.Contains(r.Id))
            .ToListAsync(ct);

        if (resources.Count == 0)
        {
            return Result.Fail("No resources found matching the specified IDs.");
        }

        foreach (var resource in resources)
        {
            resource.AssignContent(command.ContentId);
        }

        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
