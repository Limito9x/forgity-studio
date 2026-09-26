using System.Text.Json;
using FluentResults;

namespace Automation.Studio.Contracts;

public record ProjectExecutorConfigResultDto(
    Guid Id,
    Guid ProjectId,
    Guid AgentId,
    string ExecutorKey,
    JsonDocument? Settings
);

public interface IStudioApi
{
    Task<Result<ProjectExecutorConfigResultDto?>> GetExecutorConfigAsync(
        Guid projectId,
        Guid agentId,
        string executorKey,
        CancellationToken ct = default
    );
}

public interface IProjectsApi : IStudioApi
{
}
