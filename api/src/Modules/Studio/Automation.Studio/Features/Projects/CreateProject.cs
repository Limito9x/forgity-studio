using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;
using Automation.SharedKernel.Extensions.Strings;

namespace Automation.Studio.Features.Projects;

public record CreateProjectCommand(string Name, string? Slug = null, Guid? StudioId = null);

public class CreateProjectValidator : Validator<CreateProjectCommand>
{
    public CreateProjectValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(255);

        RuleFor(x => x.Slug)
            .MaximumLength(150)
            .When(x => !string.IsNullOrEmpty(x.Slug));
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
        if ((!req.StudioId.HasValue || req.StudioId.Value == Guid.Empty) &&
            HttpContext.Request.Headers.TryGetValue("X-Studio-Id", out var studioHeader) &&
            Guid.TryParse(studioHeader, out var sId) &&
            sId != Guid.Empty)
        {
            req = req with { StudioId = sId };
        }

        var result = await bus.InvokeAsync<Result<ProjectDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(StudioDbContext))]
public class CreateProjectHandler(
    StudioDbContext db,
    ICurrentUserProvider userProvider)
{
    public async Task<Result<ProjectDto>> HandleAsync(
        CreateProjectCommand request,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail<ProjectDto>(new UnauthorizedError("User is not authenticated"));
        }

        var targetStudioId = request.StudioId;

        if (!targetStudioId.HasValue || targetStudioId.Value == Guid.Empty)
        {
            var defaultStudio = await db.Studios.FirstOrDefaultAsync(ct);
            if (defaultStudio is not null)
            {
                targetStudioId = defaultStudio.Id;
            }
            else
            {
                return Result.Fail<ProjectDto>("No active studio found to associate project with.");
            }
        }

        var slug = string.IsNullOrWhiteSpace(request.Slug) ? request.Name.ToSlug() : request.Slug.ToSlug();
        if (string.IsNullOrWhiteSpace(slug))
        {
            return Result.Fail<ProjectDto>("Cannot generate a valid slug from project name.");
        }

        var slugExists = await db.Projects.AnyAsync(p => p.StudioId == targetStudioId.Value && p.Slug == slug, ct);
        if (slugExists)
        {
            return Result.Fail<ProjectDto>($"Project with slug '{slug}' already exists in this studio.");
        }

        var project = new Project(targetStudioId.Value, request.Name, slug, userProvider.UserId.Value);

        db.Projects.Add(project);
        await db.SaveChangesAsync(ct);
        
        return Result.Ok(project.Adapt<ProjectDto>());
    }
}
