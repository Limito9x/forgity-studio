using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;

namespace Automation.Studio.Features.Projects;

public record DeleteProjectCommand(Guid Id);

public class DeleteProjectEndpoint(IMessageBus bus)
    : Endpoint<DeleteProjectCommand>
{
    public override void Configure()
    {
        Delete("/{id}");
        Group<ProjectsGroup>();
        Permissions(P.Project.Delete);
        Description(x => x.WithName("DeleteProject"));
    }

    public override async Task HandleAsync(
        DeleteProjectCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(StudioDbContext))]
public class DeleteProjectHandler(StudioDbContext db, ICurrentUserProvider userProvider)
{
    public async Task<Result> HandleAsync(
        DeleteProjectCommand command,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail(new UnauthorizedError("User is not authenticated"));
        }

        var userId = userProvider.UserId.Value;

        var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == command.Id && x.OwnerId == userId, ct);
        if (project is null) return Result.Fail(new NotFoundError("Project not found or you don't have permission to delete it"));
        
        db.Projects.Remove(project);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok();
    }
}
