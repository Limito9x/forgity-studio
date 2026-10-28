using Automation.Repository.Constants;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Runner.Contracts;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Repositories;

public record GetProjectWorkstationsQuery(Guid ProjectId);

public record WorkstationRootDto(
    Guid RepositoryRunnerId,
    Guid RepositoryId,
    string RepositoryName,
    Guid RunnerId,
    string RunnerName,
    string RootPath,
    bool IsRunnerActive
);

public class GetProjectWorkstationsEndpoint(IMessageBus bus)
    : Endpoint<GetProjectWorkstationsQuery, IReadOnlyList<WorkstationRootDto>>
{
    public override void Configure()
    {
        Get("workstations");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.GetAll);
        Description(x => x.WithName("GetProjectWorkstations"));
    }

    public override async Task HandleAsync(GetProjectWorkstationsQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<WorkstationRootDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetProjectWorkstationsHandler(RepositoryDbContext db, IRunnerApi runnerApi)
{
    public async Task<Result<IReadOnlyList<WorkstationRootDto>>> HandleAsync(
        GetProjectWorkstationsQuery query,
        CancellationToken ct
    )
    {
        var items = await db.RepositoryRunners
            .AsNoTracking()
            .Include(rr => rr.Repository)
            .Where(rr => rr.Repository.ProjectId == query.ProjectId)
            .OrderBy(rr => rr.Repository.Name)
            .ThenBy(rr => rr.RootPath)
            .ToListAsync(ct);

        var runnerIds = items.Select(x => x.RunnerId).Distinct().ToList();
        IReadOnlyDictionary<Guid, RunnerDto> runnerMap = new Dictionary<Guid, RunnerDto>();
        if (runnerIds.Count > 0)
        {
            var runnerMapResult = await runnerApi.GetAgentsMapByIdsAsync(runnerIds, ct);
            if (runnerMapResult.IsSuccess && runnerMapResult.Value != null)
            {
                runnerMap = runnerMapResult.Value;
            }
        }

        var result = items.Select(rr =>
        {
            var runnerInfo = runnerMap.TryGetValue(rr.RunnerId, out var rDto) ? rDto : null;
            return new WorkstationRootDto(
                RepositoryRunnerId: rr.Id,
                RepositoryId: rr.RepositoryId,
                RepositoryName: rr.Repository?.Name ?? string.Empty,
                RunnerId: rr.RunnerId,
                RunnerName: runnerInfo?.Name ?? "Unknown Runner",
                RootPath: rr.RootPath,
                IsRunnerActive: runnerInfo?.IsActive ?? false
            );
        }).ToList();

        return Result.Ok<IReadOnlyList<WorkstationRootDto>>(result);
    }
}
