using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;

namespace Automation.Studio.Features.Projects;

public record GetProjectByIdQuery(string Id, string? StudioKeyOrId = null);

public class GetProjectByIdEndpoint(IMessageBus bus)
    : Endpoint<GetProjectByIdQuery, ProjectDto>
{
    public override void Configure()
    {
        Get("/{id}");
        Group<ProjectsGroup>();
        Permissions(P.Project.GetById);
        Description(x => x.WithName("GetProjectById"));
    }

    public override async Task HandleAsync(
        GetProjectByIdQuery req,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.StudioKeyOrId) &&
            HttpContext.Request.Headers.TryGetValue("X-Studio-Id", out var studioHeader))
        {
            req = req with { StudioKeyOrId = studioHeader.ToString() };
        }

        var result = await bus.InvokeAsync<Result<ProjectDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetProjectByIdHandler(StudioDbContext db, ICurrentUserProvider userProvider)
{
    public async Task<Result<ProjectDto>> HandleAsync(
        GetProjectByIdQuery query,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail(new UnauthorizedError("User is not authenticated"));
        }

        var userId = userProvider.UserId.Value;

        var queryable = db.Projects
            .AsNoTracking()
            .Include(x => x.Studio)
            .Where(x => x.OwnerId == userId || db.ProjectMembers.Any(pm => pm.ProjectId == x.Id && pm.UserId == userId));

        Project? project = null;

        if (Guid.TryParse(query.Id, out var idGuid))
        {
            project = await queryable.FirstOrDefaultAsync(x => x.Id == idGuid, ct);
        }
        else
        {
            var slug = query.Id.Trim().ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(query.StudioKeyOrId))
            {
                if (Guid.TryParse(query.StudioKeyOrId, out var sId))
                {
                    project = await queryable.FirstOrDefaultAsync(x => x.StudioId == sId && x.Slug == slug, ct);
                }
                else
                {
                    var sSlug = query.StudioKeyOrId.Trim().ToLowerInvariant();
                    project = await queryable.FirstOrDefaultAsync(x => x.Studio.Slug == sSlug && x.Slug == slug, ct);
                }
            }
            else
            {
                project = await queryable.FirstOrDefaultAsync(x => x.Slug == slug, ct);
            }
        }

        if (project is null) return Result.Fail(new NotFoundError("Project not found"));
        
        return Result.Ok(project.Adapt<ProjectDto>());
    }
}
