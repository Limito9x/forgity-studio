using Automation.Runner.Contracts;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Workspaces.GetWorkspaceById;

[NonTransactional]
public class GetWorkspaceByIdHandler(WorkspaceDbContext db, IRunnerApi agentApi)
{
    public async Task<Result<WorkspaceDetailDto>> HandleAsync(
        GetWorkspaceByIdQuery query,
        CancellationToken ct
    )
    {
        var workspaceData = await db
            .Workspaces.AsNoTracking()
            .Include(ws => ws.WorkspacePlatforms)
            .Include(ws => ws.WorkspaceAgents)
                .ThenInclude(wsa => wsa.Locations)
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (workspaceData is null)
            return Result.Fail($"Workspace with ID '{query.Id}' was not found.");

        var agentIds = workspaceData.WorkspaceAgents.Select(x => x.AgentId).Distinct().ToList();

        IReadOnlyDictionary<Guid, RunnerDto> agentMap = new Dictionary<Guid, RunnerDto>();
        if (agentIds.Count > 0)
        {
            var agentMapResult = await agentApi.GetAgentsMapByIdsAsync(agentIds, ct);
            if (agentMapResult.IsSuccess)
            {
                agentMap = agentMapResult.Value;
            }
        }

        var workspaceAgents = workspaceData
            .WorkspaceAgents.Select(wa => new WorkspaceAgentDto(
                wa.Id,
                wa.AgentId,
                wa.RootPath,
                wa.CreatedAt,
                wa.Locations.Count != 0 ? wa.Locations.Max(x => x.DiscoveredAt) : null,
                agentMap.GetValueOrDefault(wa.AgentId)
            ))
            .ToList();

        var resourceCount = await db.ResourceItems.CountAsync(x => x.WorkspaceId == query.Id, ct);
        var locationCount = workspaceData.WorkspaceAgents.Sum(wa => wa.Locations.Count);

        var detailDto = new WorkspaceDetailDto(
            workspaceData.Id,
            workspaceData.ProjectId,
            workspaceData.Name,
            workspaceAgents.Count,
            resourceCount,
            locationCount,
            workspaceAgents,
            workspaceData.CreatedAt,
            workspaceData.WorkspacePlatforms.Select(wp => wp.PlatformId).ToList()
        );

        return Result.Ok(detailDto);
    }
}
