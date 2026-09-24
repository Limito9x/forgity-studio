using Automation.Runner.Contracts;
using Automation.Workspace.Constants;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using FastEndpoints;
using FluentResults;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Resources;

// 1. Query & Dtos
public class GetAvailableAgentsQuery
{
    public List<Guid> ResourceIds { get; set; } = [];
    public Guid RepositoryId { get; set; }
    public Guid WorkspaceId
    {
        get => RepositoryId;
        set => RepositoryId = value;
    }

    public GetAvailableAgentsQuery() { }

    public GetAvailableAgentsQuery(List<Guid> resourceIds, Guid repositoryId)
    {
        ResourceIds = resourceIds;
        RepositoryId = repositoryId;
    }
}

public record AvailableAgentDto(
    Guid AgentId,
    string AgentName,
    bool IsAvailable,
    List<string> AvailableExecutors,
    List<AgentResourceDto> AvailableResources
);

public record AgentResourceDto(Guid ResourceId, ResourceVersionDto? LatestVersion);

// 2. Endpoint
public class GetAvailableAgentsEndpoint(IMessageBus bus)
    : Endpoint<GetAvailableAgentsQuery, List<AvailableAgentDto>>
{
    public override void Configure()
    {
        Post("/available-agents");
        Group<ResourcesGroup>();
        Permissions(P.Resource.GetAll);
    }

    public override async Task HandleAsync(GetAvailableAgentsQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<List<AvailableAgentDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[NonTransactional]
public class GetAvailableAgentsHandler(WorkspaceDbContext db, IRunnerApi runnerApi)
{
    public async Task<Result<List<AvailableAgentDto>>> HandleAsync(
        GetAvailableAgentsQuery query,
        CancellationToken ct
    )
    {
        // 1. Lọc resources theo RepositoryId và ResourceIds (nếu có truyền)
        var queryable = db.ResourceItems.Where(r => r.RepositoryId == query.RepositoryId);
        if (query.ResourceIds is { Count: > 0 })
        {
            queryable = queryable.Where(r => query.ResourceIds.Contains(r.Id));
        }

        var resources = await queryable
            .Include(r => r.Versions)
                .ThenInclude(v => v.Locations)
                    .ThenInclude(l => l.RepositoryRunner)
            .ToListAsync(ct);

        // 2. Lấy danh sách RunnerId có lưu trữ ít nhất 1 resource
        var runnerIds = resources
            .SelectMany(r => r.Versions.SelectMany(v => v.Locations))
            .Select(l => l.RepositoryRunner.RunnerId)
            .Distinct()
            .ToList();

        if (runnerIds.Count == 0)
            return Result.Ok(new List<AvailableAgentDto>());

        // 3. Lấy thông tin Runner, trạng thái Online và Executor từ Runner Module
        var runnersResult = await runnerApi.GetAgentInfoByIds(runnerIds, ct);
        if (runnersResult.IsFailed)
            return Result.Fail(runnersResult.Errors);

        // 4. Tổng hợp danh sách AvailableAgentDto
        var result = new List<AvailableAgentDto>();
        foreach (var runner in runnersResult.Value)
        {
            var runnerResources = resources
                .Where(r =>
                    r.Versions.Any(v => v.Locations.Any(l => l.RepositoryRunner.RunnerId == runner.Id))
                )
                .Select(r =>
                {
                    var latestVersionOnRunner = r
                        .Versions.Where(v =>
                            v.Locations.Any(l => l.RepositoryRunner.RunnerId == runner.Id)
                        )
                        .OrderByDescending(v => v.VersionNo)
                        .FirstOrDefault();

                    return new AgentResourceDto(
                        r.Id,
                        latestVersionOnRunner?.Adapt<ResourceVersionDto>()
                    );
                })
                .ToList();

            var availableExecutors = runner.ExecutorConfigs.Select(x => x.Key).Distinct().ToList();
            result.Add(
                new AvailableAgentDto(
                    runner.Id,
                    runner.Name,
                    runner.IsAvailable,
                    availableExecutors,
                    runnerResources
                )
            );
        }

        return Result.Ok(result);
    }
}
