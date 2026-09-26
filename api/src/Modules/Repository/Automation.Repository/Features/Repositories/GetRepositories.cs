using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Repositories;

public record GetRepositoriesQuery(Guid ProjectId);

public class GetRepositoriesEndpoint(IMessageBus bus)
    : Endpoint<GetRepositoriesQuery, IReadOnlyList<RepositoryDto>>
{
    public override void Configure()
    {
        Get("");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.GetAll);
        Description(x => x.WithName("GetRepositories"));
    }

    public override async Task HandleAsync(GetRepositoriesQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<RepositoryDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRepositoriesHandler(RepositoryDbContext db)
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
