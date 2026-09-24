using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Projects.Domain.Entities;
using Automation.Projects.Infrastructure.Persistence;
using Automation.Projects.Shared.Dtos;

namespace Automation.Projects.Features.Projects;

public record UpdateProjectCommand(Guid Id, string Name);

public class UpdateProjectValidator : Validator<UpdateProjectCommand>
{
    public UpdateProjectValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty();
            
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(255);
    }
}

public class UpdateProjectEndpoint(IMessageBus bus)
    : Endpoint<UpdateProjectCommand, ProjectDto>
{
    public override void Configure()
    {
        Put("{Id:guid}");
        Group<ProjectsGroup>();
        Permissions(P.Project.Update);
        Description(x => x.WithName("UpdateProject"));
    }

    public override async Task HandleAsync(
        UpdateProjectCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ProjectDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ProjectsDbContext))]
public class UpdateProjectHandler(ProjectsDbContext db)
{
    public async Task<Result<ProjectDto>> HandleAsync(
        UpdateProjectCommand request,
        CancellationToken ct)
    {
        var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (project is null) return Result.Fail(new NotFoundError("Project not found"));
        
        request.Adapt(project);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok(project.Adapt<ProjectDto>());
    }
}
