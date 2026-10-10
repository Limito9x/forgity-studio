using Microsoft.EntityFrameworkCore;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;
using Gridify;

namespace Automation.Studio.Features.Projects;

public class GetProjectsQuery : PagedQuery
{
    public Guid? StudioId { get; set; }
    public string? StudioSlug { get; set; }
}

public class GetProjectsEndpoint(IMessageBus bus)
    : Endpoint<GetProjectsQuery, PagedResult<ProjectDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<ProjectsGroup>();
        Permissions(P.Project.GetAll);
        Description(x => x.WithName("GetProjects"));
    }

    public override async Task HandleAsync(
        GetProjectsQuery req,
        CancellationToken ct)
    {
        if (!req.StudioId.HasValue &&
            HttpContext.Request.Headers.TryGetValue("X-Studio-Id", out var studioHeader) &&
            Guid.TryParse(studioHeader, out var sId) &&
            sId != Guid.Empty)
        {
            req.StudioId = sId;
        }

        var result = await bus.InvokeAsync<Result<PagedResult<ProjectDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetProjectsHandler(StudioDbContext db, ICurrentUserProvider userProvider)
{
    public async Task<Result<PagedResult<ProjectDto>>> HandleAsync(
        GetProjectsQuery query,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail(new UnauthorizedError("User is not authenticated"));
        }

        var userId = userProvider.UserId.Value;

        var mapper = new GridifyMapper<Project>()
            .GenerateMappings();

        // Tách biệt dữ liệu tuyệt đối: Bắt buộc user phải là Owner hoặc Member
        var queryable = db.Projects
            .AsNoTracking()
            .Where(x => x.OwnerId == userId || db.ProjectMembers.Any(pm => pm.ProjectId == x.Id && pm.UserId == userId));

        if (query.StudioId.HasValue && query.StudioId.Value != Guid.Empty)
        {
            queryable = queryable.Where(x => x.StudioId == query.StudioId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(query.StudioSlug))
        {
            var sSlug = query.StudioSlug.Trim().ToLowerInvariant();
            queryable = queryable.Where(x => x.Studio.Slug == sSlug);
        }

        var result = await queryable
            .ToPagedResultAsync<Project, ProjectDto>(query, mapper, ct);
            
        return result;
    }
}
