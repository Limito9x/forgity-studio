using Automation.Content.Contracts;
using Automation.Repository.Constants;
using Automation.Repository.Infrastructure.Persistence;
using FastEndpoints;
using FluentResults;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Resources;

// 1. Command & Validator
public record AssignResourcesContentCommand(
    List<Guid> ResourceIds,
    Guid? ContentId,
    string? AnchorPath = null
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
        Put("assign-content");
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
[Transactional(typeof(RepositoryDbContext))]
public class AssignResourcesContentHandler(RepositoryDbContext db, IContentApi contentApi)
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
            .Include(r => r.Repository)
            .Where(r => command.ResourceIds.Contains(r.Id))
            .ToListAsync(ct);

        if (resources.Count == 0)
        {
            return Result.Fail("No resources found matching the specified IDs.");
        }

        if (command.ContentId.HasValue)
        {
            var projectId = resources.FirstOrDefault()?.Repository?.ProjectId ?? Guid.Empty;
            var smartInputs = resources.Select(r => new ResourceSmartLinkInput(
                r.Id,
                r.DisplayName,
                r.RelativePath,
                command.AnchorPath
            )).ToList();

            var assignResult = await contentApi.AssignResourcesToAnchorAsync(
                projectId,
                command.ContentId.Value,
                command.AnchorPath,
                smartInputs,
                ct
            );

            if (assignResult.IsFailed)
            {
                return Result.Fail(assignResult.Errors);
            }
        }
        else
        {
            var unlinkResult = await contentApi.UnlinkResourcesAsync(command.ResourceIds, null, ct);
            if (unlinkResult.IsFailed)
            {
                return Result.Fail(unlinkResult.Errors);
            }
        }

        return Result.Ok();
    }
}
