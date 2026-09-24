using Automation.Runner.Contracts;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Resources.GetAvailableAgents;

[NonTransactional]
public class GetAvailableAgentsHandler(WorkspaceDbContext db, IRunnerApi agentApi)
{
    public async Task<Result<List<AvailableAgentDto>>> HandleAsync(
        GetAvailableAgentsQuery query,
        CancellationToken ct
    )
    {
        // 1. Lọc resources theo WorkspaceId và ResourceIds (nếu có truyền)
        var queryable = db.ResourceItems.Where(r => r.WorkspaceId == query.WorkspaceId);
        if (query.ResourceIds is { Count: > 0 })
        {
            queryable = queryable.Where(r => query.ResourceIds.Contains(r.Id));
        }
        var resources = await queryable
            .Include(r => r.Versions)
                .ThenInclude(v => v.Locations)
                    .ThenInclude(l => l.WorkspaceAgent)
            .ToListAsync(ct);
        // 2. Lấy danh sách các AgentId có lưu trữ ít nhất 1 resource
        var agentIds = resources
            .SelectMany(r => r.Versions.SelectMany(v => v.Locations))
            .Select(l => l.WorkspaceAgent.AgentId)
            .Distinct()
            .ToList();
        if (agentIds.Count == 0)
            return Result.Ok(new List<AvailableAgentDto>());
        // 3. Lấy thông tin Agent, trạng thái Online và Executor từ Agent Module
        var agentsResult = await agentApi.GetAgentInfoByIds(agentIds, ct);
        if (agentsResult.IsFailed)
            return Result.Fail(agentsResult.Errors);
        // 4. Tổng hợp danh sách AvailableAgentDto
        var result = new List<AvailableAgentDto>();
        foreach (var agent in agentsResult.Value)
        {
            // Lọc các resource mà agent này đang có location
            var agentResources = resources
                .Where(r =>
                    r.Versions.Any(v => v.Locations.Any(l => l.WorkspaceAgent.AgentId == agent.Id))
                )
                .Select(r =>
                {
                    // Lấy version cao nhất hiện có trên máy agent này
                    var latestVersionOnAgent = r
                        .Versions.Where(v =>
                            v.Locations.Any(l => l.WorkspaceAgent.AgentId == agent.Id)
                        )
                        .OrderByDescending(v => v.VersionNo)
                        .FirstOrDefault();
                    return new AgentResourceDto(
                        r.Id,
                        latestVersionOnAgent?.Adapt<ResourceVersionDto>()
                    );
                })
                .ToList();
            var availableExecutors = agent.ExecutorConfigs.Select(x => x.Key).Distinct().ToList();
            result.Add(
                new AvailableAgentDto(
                    agent.Id,
                    agent.Name,
                    agent.IsAvailable,
                    availableExecutors,
                    agentResources
                )
            );
        }
        return Result.Ok(result);
    }
}
