using Microsoft.EntityFrameworkCore;
using Automation.Projects.Domain.Entities;
using Automation.Projects.Infrastructure.Persistence;
using Automation.Projects.Shared.Dtos;

namespace Automation.Projects.Features.Projects;

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

public class DeleteProjectHandler(ProjectsDbContext db)
{
    public async Task<Result> HandleAsync(
        DeleteProjectCommand command,
        CancellationToken ct)
    {
        var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (project is null) return Result.Fail(new NotFoundError("Project not found"));
        
        db.Projects.Remove(project);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok();
    }
}
