using Automation.Studio.Contracts;
using Automation.Studio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Automation.Studio.Infrastructure.Services;

public class StudioApiService(StudioDbContext db) : IStudioApi, IProjectsApi
{
    public async Task<Result<ProjectExecutorConfigResultDto?>> GetExecutorConfigAsync(
        Guid projectId,
        Guid agentId,
        string executorKey,
        CancellationToken ct = default
    )
    {
        var config = await db.ProjectExecutorConfigs
            .AsNoTracking()
            .Where(x => x.ProjectId == projectId && x.AgentId == agentId && x.ExecutorKey == executorKey)
            .Select(x => new ProjectExecutorConfigResultDto(
                x.Id,
                x.ProjectId,
                x.AgentId,
                x.ExecutorKey,
                x.Settings
            ))
            .FirstOrDefaultAsync(ct);

        return Result.Ok<ProjectExecutorConfigResultDto?>(config);
    }
}
