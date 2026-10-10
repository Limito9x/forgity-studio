using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;
using Automation.SharedKernel.Extensions.Strings;

namespace Automation.Studio.Features.Projects;

public record UpdateProjectCommand(Guid Id, string Name, string? Slug = null);

public class UpdateProjectValidator : Validator<UpdateProjectCommand>
{
    public UpdateProjectValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty();
            
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(255);

        RuleFor(x => x.Slug)
            .MaximumLength(150)
            .When(x => !string.IsNullOrEmpty(x.Slug));
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

[Transactional(typeof(StudioDbContext))]
public class UpdateProjectHandler(StudioDbContext db, ICurrentUserProvider userProvider)
{
    public async Task<Result<ProjectDto>> HandleAsync(
        UpdateProjectCommand request,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail(new UnauthorizedError("User is not authenticated"));
        }

        var userId = userProvider.UserId.Value;

        var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == request.Id && x.OwnerId == userId, ct);
        if (project is null) return Result.Fail(new NotFoundError("Project not found or you don't have permission to edit it"));

        var targetSlug = string.IsNullOrWhiteSpace(request.Slug) 
            ? project.Slug 
            : request.Slug.ToSlug();

        if (string.IsNullOrWhiteSpace(targetSlug))
        {
            targetSlug = request.Name.ToSlug();
        }

        if (!string.Equals(project.Slug, targetSlug, StringComparison.OrdinalIgnoreCase))
        {
            var slugExists = await db.Projects.AnyAsync(x => x.StudioId == project.StudioId && x.Slug == targetSlug && x.Id != project.Id, ct);
            if (slugExists)
            {
                return Result.Fail<ProjectDto>($"Project with slug '{targetSlug}' already exists in this studio.");
            }
        }

        project.Update(request.Name, targetSlug);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok(project.Adapt<ProjectDto>());
    }
}

