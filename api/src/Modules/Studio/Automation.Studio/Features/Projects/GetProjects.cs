using Microsoft.EntityFrameworkCore;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;
using Gridify;

namespace Automation.Studio.Features.Projects;

public class GetProjectsQuery : PagedQuery;

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

        var result = await db.Projects
            .Where(x => x.OwnerId == userId)
            .AsNoTracking()
            .ToPagedResultAsync<Project, ProjectDto>(query, mapper, ct);
            
        return result;
    }
}
