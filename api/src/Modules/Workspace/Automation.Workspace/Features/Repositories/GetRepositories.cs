using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Repositories;

public record GetRepositoriesQuery(Guid ProjectId);

public class GetRepositoriesEndpoint(IMessageBus bus)
    : Endpoint<GetRepositoriesQuery, IReadOnlyList<RepositoryDto>>
{
    public override void Configure()
    {
        Get("");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.GetAll);
    }

    public override async Task HandleAsync(GetRepositoriesQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<RepositoryDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRepositoriesHandler(WorkspaceDbContext db)
{
    public async Task<Result<IReadOnlyList<RepositoryDto>>> HandleAsync(GetRepositoriesQuery query, CancellationToken ct)
    {
        var repositories = await db.Repositories
            .AsNoTracking()
            .Where(x => x.ProjectId == query.ProjectId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new RepositoryDto(
                x.Id,
                x.ProjectId,
                x.Name,
                x.Description,
                x.RepositoryRunners.Count,
                x.Resources.Count,
                x.CreatedAt
            ))
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<RepositoryDto>>(repositories);
    }
}
