namespace Automation.Runner.Contracts;

public record RunnerExecutorConfigDto(
    Guid Id,
    Guid RunnerId,
    string ExecutorKey,
    string ExecutablePath,
    string? Version,
    DateTimeOffset CreatedAt
);

public record RunnerInfo(
    Guid Id,
    string Name,
    bool IsAvailable,
    List<RunnerExecutorConfigInfo> ExecutorConfigs
);

public record RunnerExecutorConfigInfo(string Key, string ExecutablePath, string? Version);

// Backward-compatibility aliases
public record AgentExecutorConfigDto(
    Guid Id,
    Guid AgentId,
    string ExecutorKey,
    string ExecutablePath,
    string? Version,
    DateTimeOffset CreatedAt
) : RunnerExecutorConfigDto(Id, AgentId, ExecutorKey, ExecutablePath, Version, CreatedAt);

public record AgentInfo(
    Guid Id,
    string Name,
    bool IsAvailable,
    List<AgentExecutorConfigInfo> ExecutorConfigs
);

public record AgentExecutorConfigInfo(string Key, string ExecutablePath, string? Version);
