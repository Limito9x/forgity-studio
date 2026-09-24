using Automation.Runner.Contracts;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Repositories;

public record GetRepositoryByIdQuery(Guid Id);

public record RepositoryDetailDto(
    Guid Id,
    Guid ProjectId,
    string Name,
    string? Description,
    DateTimeOffset CreatedAt,
    IReadOnlyList<RepositoryRunnerDto> Runners
);

public class GetRepositoryByIdEndpoint(IMessageBus bus)
    : Endpoint<GetRepositoryByIdQuery, RepositoryDetailDto>
{
    public override void Configure()
    {
        Get("{id:guid}");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.GetById);
        Description(x => x.WithName("GetRepositoryById"));
    }

    public override async Task HandleAsync(GetRepositoryByIdQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RepositoryDetailDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRepositoryByIdHandler(RepositoryDbContext db, IRunnerApi runnerApi)
{
    public async Task<Result<RepositoryDetailDto>> HandleAsync(GetRepositoryByIdQuery query, CancellationToken ct)
    {
        var repo = await db.Repositories
            .AsNoTracking()
            .Include(r => r.RepositoryRunners)
                .ThenInclude(rr => rr.Locations)
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (repo is null)
            return Result.Fail($"Repository with ID '{query.Id}' was not found.");

        var runnerIds = repo.RepositoryRunners.Select(x => x.RunnerId).Distinct().ToList();
        IReadOnlyDictionary<Guid, RunnerDto> runnerMap = new Dictionary<Guid, RunnerDto>();
        if (runnerIds.Count > 0)
        {
            var runnerMapResult = await runnerApi.GetAgentsMapByIdsAsync(runnerIds, ct);
            if (runnerMapResult.IsSuccess)
            {
                runnerMap = runnerMapResult.Value;
            }
        }

        var runners = repo.RepositoryRunners.Select(rr => new RepositoryRunnerDto(
            rr.Id,
            rr.RunnerId,
            rr.RootPath,
            rr.CreatedAt,
            rr.Locations.Count != 0 ? rr.Locations.Max(x => x.DiscoveredAt) : null,
            runnerMap.TryGetValue(rr.RunnerId, out var rDto) ? rDto : null
        )).ToList();

        var detail = new RepositoryDetailDto(
            repo.Id,
            repo.ProjectId,
            repo.Name,
            repo.Description,
            repo.CreatedAt,
            runners
        );

        return Result.Ok(detail);
    }
}
