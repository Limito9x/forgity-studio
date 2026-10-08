using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;

namespace Automation.Studio.Features.Projects;

public record GetProjectByIdQuery(Guid Id);

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

        var project = await db.Projects
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.Id &&
                (x.OwnerId == userId || db.ProjectMembers.Any(pm => pm.ProjectId == x.Id && pm.UserId == userId)), ct);

        if (project is null) return Result.Fail(new NotFoundError("Project not found"));
        
        return Result.Ok(project.Adapt<ProjectDto>());
    }
}
