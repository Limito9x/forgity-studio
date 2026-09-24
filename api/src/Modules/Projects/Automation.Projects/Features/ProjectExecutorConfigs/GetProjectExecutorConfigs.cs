using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Projects.Features.Projects;
using Automation.Projects.Infrastructure.Persistence;
using Automation.Projects.Shared.Dtos;

namespace Automation.Projects.Features.ProjectExecutorConfigs;

public record GetProjectExecutorConfigsQuery(Guid ProjectId);

public class GetProjectExecutorConfigsEndpoint(IMessageBus bus)
    : Endpoint<GetProjectExecutorConfigsQuery, IReadOnlyList<ProjectExecutorConfigDto>>
{
    public override void Configure()
    {
        Get("{ProjectId:guid}/executor-configs");
        Group<ProjectsGroup>();
        Permissions(P.Project.GetAll);
        Description(x => x.WithName("GetProjectExecutorConfigs"));
    }

    public override async Task HandleAsync(
        GetProjectExecutorConfigsQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<ProjectExecutorConfigDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetProjectExecutorConfigsHandler(ProjectsDbContext db)
{
    public async Task<Result<IReadOnlyList<ProjectExecutorConfigDto>>> HandleAsync(
        GetProjectExecutorConfigsQuery query,
        CancellationToken ct)
    {
        var configs = await db.ProjectExecutorConfigs
            .AsNoTracking()
            .Where(x => x.ProjectId == query.ProjectId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new ProjectExecutorConfigDto(
                x.Id,
                x.ProjectId,
                x.AgentId,
                x.ExecutorKey,
                x.Settings,
                x.CreatedAt,
                x.UpdatedAt
            ))
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<ProjectExecutorConfigDto>>(configs);
    }
}
