using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Projects.Domain.Entities;
using Automation.Projects.Infrastructure.Persistence;
using Automation.Projects.Shared.Dtos;

namespace Automation.Projects.Features.Projects;

public record CreateProjectCommand(string Name, Guid? StudioId = null);

public class CreateProjectValidator : Validator<CreateProjectCommand>
{
    public CreateProjectValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(255);
    }
}

public class CreateProjectEndpoint(IMessageBus bus)
    : Endpoint<CreateProjectCommand, ProjectDto>
{
    public override void Configure()
    {
        Post("/"); // Change this method/route accordingly
        Group<ProjectsGroup>();
        Permissions(P.Project.Create);
        Description(x => x.WithName("CreateProject"));
    }

    public override async Task HandleAsync(
        CreateProjectCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ProjectDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ProjectsDbContext))]
public class CreateProjectHandler(ProjectsDbContext db, ICurrentUserProvider userProvider)
{
    public async Task<Result<ProjectDto>> HandleAsync(
        CreateProjectCommand request,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail<ProjectDto>(new UnauthorizedError("User is not authenticated"));
        }

        var project = request.Adapt<Project>();
        project.OwnerId = userProvider.UserId.Value;

        if (project.StudioId == Guid.Empty)
        {
            var defaultStudio = await db.Studios.FirstOrDefaultAsync(ct);
            if (defaultStudio is not null)
            {
                project.StudioId = defaultStudio.Id;
            }
        }

        db.Projects.Add(project);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok(project.Adapt<ProjectDto>());
    }
}
